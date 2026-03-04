export function isOwnershipError(error: unknown): boolean {
  return error instanceof Error && /not found or not accessible/i.test(error.message)
}
