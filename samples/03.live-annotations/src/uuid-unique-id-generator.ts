import { UniqueId } from '@ms/ink/model/UniqueId';
import { UniqueIdGenerator } from '@ms/ink/model/UniqueIdGenerator';
import { v4 as uuid } from 'uuid';

export class UuidUniqueIdGenerator implements UniqueIdGenerator {
    public generate(): UniqueId {
        return uuid();
    }
}