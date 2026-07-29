export const compositionStyles = String.raw`
  :root {
    color-scheme: only light;
  }

  * {
    box-sizing: border-box;
  }

  .composition-canvas {
    background: #f7f3ef;
    color: #211c1d;
    display: block;
    isolation: isolate;
    margin: 0;
    overflow: hidden;
    position: relative;
  }

  .composition-canvas[data-font-style="modern"] {
    font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC",
      sans-serif;
  }

  .composition-canvas[data-font-style="warm"] {
    font-family: "Kaiti SC", "STKaiti", "FangSong", "Noto Serif CJK SC",
      serif;
  }

  .composition-canvas[data-font-style="editorial"] {
    font-family: "Songti SC", "STSong", "Noto Serif CJK SC", serif;
  }

  .composition-canvas img {
    display: block;
    height: 100%;
    object-fit: cover;
    width: 100%;
  }

  .composition-xhs__photo {
    inset: 0;
    position: absolute;
  }

  .composition-xhs__veil {
    background:
      linear-gradient(180deg, rgba(16, 12, 13, 0.08) 20%, transparent 42%),
      linear-gradient(0deg, var(--brand-primary) 0%, rgba(22, 13, 17, 0.08) 70%);
    inset: 0;
    opacity: 0.93;
    position: absolute;
  }

  .composition-xhs__brand {
    align-items: center;
    background: rgba(255, 255, 255, 0.92);
    border-radius: 999px;
    color: var(--brand-primary);
    display: flex;
    font-size: 29px;
    font-weight: 600;
    left: 72px;
    letter-spacing: 0.08em;
    max-width: 880px;
    min-height: 64px;
    padding: 12px 30px;
    position: absolute;
    top: 72px;
  }

  .composition-xhs__copy {
    bottom: 86px;
    color: #fff;
    left: 72px;
    position: absolute;
    right: 72px;
    text-shadow: 0 2px 16px rgba(0, 0, 0, 0.18);
  }

  .composition-xhs__eyebrow {
    align-items: center;
    display: flex;
    font-size: 28px;
    font-weight: 600;
    gap: 16px;
    letter-spacing: 0.18em;
    margin: 0 0 28px;
  }

  .composition-xhs__eyebrow::before {
    background: var(--brand-accent);
    content: "";
    height: 8px;
    width: 64px;
  }

  .composition-xhs__headline {
    font-size: 88px;
    font-weight: 720;
    letter-spacing: -0.045em;
    line-height: 1.13;
    margin: 0;
    max-height: 306px;
    overflow: hidden;
    white-space: pre-wrap;
  }

  .composition-xhs__body {
    font-size: 34px;
    font-weight: 450;
    line-height: 1.55;
    margin: 34px 0 0;
    max-height: 108px;
    max-width: 850px;
    overflow: hidden;
    white-space: pre-wrap;
  }

  .composition-moments {
    background:
      radial-gradient(circle at 82% 14%, var(--brand-accent), transparent 27%),
      #fbf7f2;
    padding: 64px;
  }

  .composition-moments__frame {
    background: #fff;
    border-radius: 36px;
    box-shadow: 0 28px 70px rgba(38, 26, 29, 0.13);
    display: grid;
    grid-template-columns: 0.9fr 1.1fr;
    height: 100%;
    overflow: hidden;
  }

  .composition-moments__photo {
    min-width: 0;
    position: relative;
  }

  .composition-moments__photo::after {
    background: linear-gradient(0deg, var(--brand-primary), transparent 56%);
    content: "";
    inset: 0;
    opacity: 0.44;
    position: absolute;
  }

  .composition-moments__copy {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 76px 64px 64px;
  }

  .composition-moments__brand {
    color: var(--brand-primary);
    font-size: 25px;
    font-weight: 650;
    letter-spacing: 0.12em;
    margin: 0 0 82px;
    max-height: 76px;
    overflow: hidden;
  }

  .composition-moments__headline {
    color: var(--brand-primary);
    font-size: 62px;
    font-weight: 720;
    letter-spacing: -0.045em;
    line-height: 1.18;
    margin: 0;
    max-height: 222px;
    overflow: hidden;
    white-space: pre-wrap;
  }

  .composition-moments__rule {
    background: var(--brand-accent);
    height: 8px;
    margin: 42px 0;
    width: 88px;
  }

  .composition-moments__body {
    color: #4b4143;
    font-size: 32px;
    line-height: 1.7;
    margin: 0;
    max-height: 274px;
    overflow: hidden;
    white-space: pre-wrap;
  }

  .composition-moments__signature {
    color: var(--brand-primary);
    font-size: 25px;
    font-weight: 600;
    margin: auto 0 0;
  }
`;
