export class SkillProtocolError extends Error {
  readonly code = "INVALID_SKILL_PROVIDER_OUTPUT";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SkillProtocolError";
  }
}
