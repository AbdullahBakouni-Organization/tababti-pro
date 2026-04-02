/**
 * Generic Mongoose model mock factory for unit tests.
 * Returns an object with all common Mongoose Model methods as jest.fn() mocks.
 *
 * Usage:
 *   const mockUserModel = createMockModel();
 *   providers: [{ provide: getModelToken(User.name), useValue: mockUserModel }]
 */
export function createMockModel() {
  const mockQuery = {
    exec: jest.fn(),
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    session: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  };

  return {
    find: jest.fn().mockReturnValue(mockQuery),
    findOne: jest.fn().mockReturnValue(mockQuery),
    findById: jest.fn().mockReturnValue(mockQuery),
    findOneAndUpdate: jest.fn().mockReturnValue(mockQuery),
    findOneAndDelete: jest.fn().mockReturnValue(mockQuery),
    findByIdAndUpdate: jest.fn().mockReturnValue(mockQuery),
    findByIdAndDelete: jest.fn().mockReturnValue(mockQuery),
    create: jest.fn(),
    insertMany: jest.fn(),
    updateOne: jest.fn().mockReturnValue(mockQuery),
    updateMany: jest.fn().mockReturnValue(mockQuery),
    deleteOne: jest.fn().mockReturnValue(mockQuery),
    deleteMany: jest.fn().mockReturnValue(mockQuery),
    countDocuments: jest.fn().mockReturnValue(mockQuery),
    aggregate: jest.fn().mockReturnValue(mockQuery),
    distinct: jest.fn().mockReturnValue(mockQuery),
    estimatedDocumentCount: jest.fn().mockReturnValue(mockQuery),
    exists: jest.fn().mockReturnValue(mockQuery),
    bulkWrite: jest.fn(),
    // For constructor-based usage: new Model(data)
    constructor: jest.fn(),
    // Allow access to the inner query mock for chaining assertions
    _mockQuery: mockQuery,
  };
}

/**
 * Creates a mock Mongoose document with save/toObject/toJSON methods.
 */
export function createMockDocument<T extends Record<string, unknown>>(data: T) {
  return {
    ...data,
    _id: data['_id'] ?? 'mock-id',
    save: jest.fn().mockResolvedValue(data),
    toObject: jest.fn().mockReturnValue(data),
    toJSON: jest.fn().mockReturnValue(data),
    populate: jest.fn().mockResolvedValue(data),
    deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  };
}

/**
 * Creates a mock Mongoose connection for transaction testing.
 */
export function createMockConnection() {
  const mockSession = {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn().mockResolvedValue(undefined),
    inTransaction: jest.fn().mockReturnValue(true),
  };

  return {
    startSession: jest.fn().mockResolvedValue(mockSession),
    _mockSession: mockSession,
  };
}
