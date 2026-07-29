import { createHash } from "node:crypto";

import {
  containsPersonalInformation,
  type CreateKnowledgeImportInput,
} from "@marketing-ai/database";
import { z } from "zod";

const MAX_SOURCE_BYTES = 100_000;
const allowedMediaTypes = new Set([
  "application/json",
  "text/csv",
  "text/html",
  "text/markdown",
  "text/plain",
]);
const mediaTypeByExtension: Readonly<Record<string, string>> = {
  csv: "text/csv",
  html: "text/html",
  htm: "text/html",
  json: "application/json",
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
};
const pastedMaterialSchema = z
  .object({
    source_name: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1),
  })
  .strict();

export class InvalidKnowledgeImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidKnowledgeImportError";
  }
}

function safeSourceName(value: string, fallback: string): string {
  const name = value.replaceAll("\\", "/").split("/").at(-1)?.trim() ?? "";
  return (name || fallback).slice(0, 200);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function finalize(
  input: Omit<CreateKnowledgeImportInput, "sourceHash" | "sourceSize">,
): CreateKnowledgeImportInput {
  const sourceText = input.sourceText.trim();
  const sourceSize = byteLength(sourceText);
  if (!sourceText) {
    throw new InvalidKnowledgeImportError("资料内容不能为空");
  }
  if (sourceSize > MAX_SOURCE_BYTES) {
    throw new InvalidKnowledgeImportError("资料文件不能超过 100 KB");
  }
  if (sourceText.includes("\0")) {
    throw new InvalidKnowledgeImportError("资料内容包含不支持的空字符");
  }
  if (
    sourceText.includes("\uFFFD") ||
    /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(sourceText)
  ) {
    throw new InvalidKnowledgeImportError(
      "资料必须是有效的 UTF-8 文本，不能包含二进制控制字符",
    );
  }
  if (containsPersonalInformation(sourceText)) {
    throw new InvalidKnowledgeImportError(
      "资料中检测到姓名、手机号、微信号、身份证号或邮箱等个人信息，请移除会员明细后重试",
    );
  }
  return {
    ...input,
    sourceHash: createHash("sha256").update(sourceText).digest("hex"),
    sourceSize,
    sourceText,
  };
}

async function uploadedMaterial(
  request: Request,
): Promise<CreateKnowledgeImportInput> {
  const form = await request.formData();
  const unknownField = [...form.keys()].find((key) => key !== "file");
  if (unknownField) {
    throw new InvalidKnowledgeImportError(
      `不支持的上传字段：${unknownField}`,
    );
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new InvalidKnowledgeImportError("请选择资料文件");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new InvalidKnowledgeImportError("资料文件不能超过 100 KB");
  }
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  const declaredMediaType = file.type.toLowerCase();
  const sourceMediaType =
    (allowedMediaTypes.has(declaredMediaType) && declaredMediaType) ||
    mediaTypeByExtension[extension];
  if (!sourceMediaType) {
    throw new InvalidKnowledgeImportError(
      "仅支持 TXT、Markdown、CSV、JSON 或 HTML 文本资料",
    );
  }
  return finalize({
    sourceKind: "upload",
    sourceMediaType,
    sourceName: safeSourceName(file.name, "商家资料.txt"),
    sourceText: await file.text(),
  });
}

export async function parseKnowledgeImportRequest(
  request: Request,
): Promise<CreateKnowledgeImportInput> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (
    contentType.startsWith("multipart/form-data") ||
    contentType.startsWith("application/x-www-form-urlencoded")
  ) {
    return uploadedMaterial(request);
  }
  if (!contentType.startsWith("application/json")) {
    throw new InvalidKnowledgeImportError(
      "请使用 JSON 粘贴资料或 multipart 上传文本文件",
    );
  }
  const parsed = pastedMaterialSchema.safeParse(await request.json());
  if (!parsed.success) {
    throw new InvalidKnowledgeImportError("资料请求格式不正确");
  }
  return finalize({
    sourceKind: "paste",
    sourceMediaType: "text/plain",
    sourceName: safeSourceName(
      parsed.data.source_name ?? "",
      "粘贴的商家资料",
    ),
    sourceText: parsed.data.text,
  });
}
