const personalInformationPatterns = [
  /(?:^|[^\d])1[3-9]\d{9}(?:$|[^\d])/,
  /\b\d{17}[\dXx]\b/,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /(?:微信(?:号|ID)?|WeChat|WX)\s*[:：]?\s*[A-Z][A-Z0-9_-]{5,19}/i,
  /(?:会员)?(?:姓名|客户名|联系人)\s*[:：]\s*[\p{Script=Han}·]{2,20}/u,
] as const;

export function containsPersonalInformation(value: string): boolean {
  return personalInformationPatterns.some((pattern) => pattern.test(value));
}
