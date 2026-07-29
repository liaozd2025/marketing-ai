import { existsSync } from "node:fs";

import {
  builtinTemplateRegistry,
  parseCompositionDocument,
  type CompositionDocument,
  type TemplateRegistry,
} from "@marketing-ai/template-composition";
import { renderCompositionHtml } from "@marketing-ai/template-composition/server";
import puppeteer, { type Browser } from "puppeteer";

const localChromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
] as const;

export interface ChromiumRendererOptions {
  readonly executablePath?: string;
  readonly registry?: TemplateRegistry;
}

export function chromiumLaunchArgs(
  disableSandbox = process.env.CHROMIUM_DISABLE_SANDBOX === "1",
): string[] {
  return [
    "--disable-dev-shm-usage",
    ...(disableSandbox
      ? ["--disable-setuid-sandbox", "--no-sandbox"]
      : []),
  ];
}

function resolveExecutablePath(configured?: string): string {
  const explicit = configured ?? process.env.CHROMIUM_EXECUTABLE_PATH;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`Chromium executable does not exist: ${explicit}`);
    }
    return explicit;
  }

  const local = localChromeCandidates.find((candidate) =>
    existsSync(candidate)
  );
  if (local) {
    return local;
  }

  try {
    return puppeteer.executablePath();
  } catch {
    throw new Error(
      "Chromium was not found. Set CHROMIUM_EXECUTABLE_PATH or run pnpm renderer:install-browser.",
    );
  }
}

/**
 * Headless Chromium renderer for trusted, code-defined React templates.
 *
 * User copy, brand values and the embedded raster asset are schema-constrained
 * before HTML exists. JavaScript and outbound requests remain disabled in the
 * browser as a second, independent boundary.
 */
export class ChromiumRenderer {
  private browser: Browser | undefined;
  private readonly executablePath: string;
  private readonly registry: TemplateRegistry;

  constructor(options: ChromiumRendererOptions = {}) {
    this.executablePath = resolveExecutablePath(options.executablePath);
    this.registry = options.registry ?? builtinTemplateRegistry;
  }

  async compose(untrustedInput: unknown): Promise<Buffer> {
    const input = parseCompositionDocument(untrustedInput);
    const template = this.registry.resolve(input.templateId);
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        const url = request.url();
        if (
          url === "about:blank" ||
          url.startsWith("data:")
        ) {
          void request.continue();
        } else {
          void request.abort("blockedbyclient");
        }
      });
      await page.setViewport({
        deviceScaleFactor: 1,
        height: template.height,
        width: template.width,
      });
      await page.setContent(renderCompositionHtml(template, input), {
        waitUntil: "domcontentloaded",
      });
      await this.verifyDocument(page, input, template.width, template.height);
      const screenshot = await page.screenshot({
        captureBeyondViewport: false,
        clip: {
          height: template.height,
          width: template.width,
          x: 0,
          y: 0,
        },
        type: "png",
      });
      const png = Buffer.from(screenshot);
      const dimensions = readPngDimensions(png);
      if (
        dimensions.width !== template.width ||
        dimensions.height !== template.height
      ) {
        throw new Error(
          `Rendered PNG has ${dimensions.width}x${dimensions.height}; expected ${template.width}x${template.height}`,
        );
      }
      return png;
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
    }
  }

  private async getBrowser(): Promise<Browser> {
    this.browser ??= await puppeteer.launch({
      args: chromiumLaunchArgs(),
      executablePath: this.executablePath,
      headless: true,
    });
    return this.browser;
  }

  private async verifyDocument(
    page: Awaited<ReturnType<Browser["newPage"]>>,
    input: CompositionDocument,
    width: number,
    height: number,
  ): Promise<void> {
    await page.evaluate(
      async ({ expected, expectedHeight, expectedWidth }) => {
        await document.fonts.ready;
        const canvas = document.querySelector<HTMLElement>(
          "[data-composition-canvas]",
        );
        if (!canvas) {
          throw new Error("Template did not render a composition canvas");
        }
        const canvasBox = canvas.getBoundingClientRect();
        if (
          Math.round(canvasBox.width) !== expectedWidth ||
          Math.round(canvasBox.height) !== expectedHeight
        ) {
          throw new Error(
            `Canvas has ${canvasBox.width}x${canvasBox.height}; expected ${expectedWidth}x${expectedHeight}`,
          );
        }

        for (const [field, value] of Object.entries(expected)) {
          const element = canvas.querySelector<HTMLElement>(
            `[data-copy-field="${field}"]`,
          );
          if (!element || element.textContent !== value) {
            throw new Error(`Template did not preserve exact ${field} text`);
          }
          const box = element.getBoundingClientRect();
          const fontSize = Number.parseFloat(
            window.getComputedStyle(element).fontSize,
          );
          // Chromium's scrollHeight includes a small glyph-overhang area for
          // several CJK system fonts even when every line is visible.
          const glyphTolerance = Number.isFinite(fontSize)
            ? Math.ceil(fontSize * 0.3)
            : 2;
          const outsideCanvas =
            box.left < canvasBox.left ||
            box.top < canvasBox.top ||
            box.right > canvasBox.right ||
            box.bottom > canvasBox.bottom;
          const overflows =
            element.scrollWidth > element.clientWidth + 1 ||
            element.scrollHeight > element.clientHeight + glyphTolerance;
          if (outsideCanvas || overflows) {
            throw new Error(
              `Template overflowed ${field} text ` +
                `(${element.clientWidth}x${element.clientHeight} visible, ` +
                `${element.scrollWidth}x${element.scrollHeight} content)`,
            );
          }
        }

        const image = canvas.querySelector<HTMLImageElement>(
          "[data-composition-asset]",
        );
        if (!image || !image.complete || image.naturalWidth < 1) {
          throw new Error("Template did not load its embedded raster asset");
        }
      },
      {
        expected: {
          body: input.copy.body,
          headline: input.copy.headline,
          merchantName: input.brand.merchantName,
        },
        expectedHeight: height,
        expectedWidth: width,
      },
    );
  }
}

export function readPngDimensions(png: Buffer): {
  readonly height: number;
  readonly width: number;
} {
  if (
    png.byteLength < 24 ||
    png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    png.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error("Renderer output is not a valid PNG");
  }
  return {
    height: png.readUInt32BE(20),
    width: png.readUInt32BE(16),
  };
}
