export class UserCreatedEvent {
  private userId: string;
  private accountId: string;

  public constructor({
    userId,
    accountId
  }: {
    userId: string;
    accountId: string;
  }) {
    this.userId = userId;
    this.accountId = accountId;
  }

  public static getName() {
    return 'user.created';
  }

  public getUserId() {
    return this.userId;
  }

  public getAccountId() {
    return this.accountId;
  }
}
