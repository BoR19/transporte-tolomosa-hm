import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';

export declare const db: Firestore;
export declare const auth: Auth;

export declare const OperationType: {
  readonly CREATE: 'create';
  readonly UPDATE: 'update';
  readonly DELETE: 'delete';
  readonly LIST: 'list';
  readonly GET: 'get';
  readonly WRITE: 'write';
};

export type OperationTypeValue = (typeof OperationType)[keyof typeof OperationType];

export declare function handleFirestoreError(
  error: unknown,
  operationType: OperationTypeValue,
  path: string | null
): never;

export declare function testConnection(): Promise<void>;
