/** A bounded page query; API-specific cursors are decoded before entering repositories. */
export type RepositoryPage = {
  limit: number;
  /** Internal look-ahead, never a client-provided limit override. */
  lookAhead?: boolean;
  before?: { createdAt: Date; id: string };
};
