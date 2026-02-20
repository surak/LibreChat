import { v4 as uuidv4 } from 'uuid';
import { EToolResources, FileContext } from 'librechat-data-provider';
import { createFileMethods } from './file';

let fileMethods: ReturnType<typeof createFileMethods>;

describe('File Methods', () => {
  beforeAll(async () => {
    fileMethods = createFileMethods();
  });

  beforeEach(async () => {
    // @ts-ignore - access to internal store for testing
    fileMethods._store?.clear();
  });

  describe('createFile', () => {
    it('should create a new file with TTL', async () => {
      const fileId = uuidv4();
      const userId = uuidv4();

      const file = await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'test.txt',
        filepath: '/uploads/test.txt',
        type: 'text/plain',
        bytes: 100,
      });

      expect(file).not.toBeNull();
      expect(file?.file_id).toBe(fileId);
      expect(file?.filename).toBe('test.txt');
      expect(file?.expiresAt).toBeDefined();
    });

    it('should create a file without TTL when disableTTL is true', async () => {
      const fileId = uuidv4();
      const userId = uuidv4();

      const file = await fileMethods.createFile(
        {
          file_id: fileId,
          user: userId,
          filename: 'permanent.txt',
          filepath: '/uploads/permanent.txt',
          type: 'text/plain',
          bytes: 200,
        },
        true,
      );

      expect(file).not.toBeNull();
      expect(file?.file_id).toBe(fileId);
      expect(file?.expiresAt).toBeUndefined();
    });
  });

  describe('findFileById', () => {
    it('should find a file by file_id', async () => {
      const fileId = uuidv4();
      const userId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'find-me.txt',
        filepath: '/uploads/find-me.txt',
        type: 'text/plain',
        bytes: 150,
      });

      const found = await fileMethods.findFileById(fileId);
      expect(found).not.toBeNull();
      expect(found?.file_id).toBe(fileId);
      expect(found?.filename).toBe('find-me.txt');
    });
  });

  describe('getFiles', () => {
    it('should retrieve multiple files matching filter', async () => {
      const userId = uuidv4();
      const fileIds = [uuidv4(), uuidv4(), uuidv4()];

      for (const fileId of fileIds) {
        await fileMethods.createFile({
          file_id: fileId,
          user: userId,
          filename: `file-${fileId}.txt`,
          filepath: `/uploads/${fileId}.txt`,
          type: 'text/plain',
          bytes: 100,
        });
      }

      const files = await fileMethods.getFiles({ user: userId });
      expect(files).toHaveLength(3);
    });
  });

  describe('updateFile', () => {
    it('should update file data and remove TTL', async () => {
      const fileId = uuidv4();
      const userId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'original.txt',
        filepath: '/uploads/original.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const updated = await fileMethods.updateFile({
        file_id: fileId,
        filename: 'updated.txt',
        bytes: 200,
      });

      expect(updated).not.toBeNull();
      expect(updated?.filename).toBe('updated.txt');
      expect(updated?.bytes).toBe(200);
      expect(updated?.expiresAt).toBeUndefined();
    });
  });

  describe('deleteFile', () => {
    it('should delete a file by file_id', async () => {
      const fileId = uuidv4();
      const userId = uuidv4();

      await fileMethods.createFile({
        file_id: fileId,
        user: userId,
        filename: 'delete-me.txt',
        filepath: '/uploads/delete-me.txt',
        type: 'text/plain',
        bytes: 100,
      });

      const deleted = await fileMethods.deleteFile(fileId);
      expect(deleted).not.toBeNull();
      expect(deleted?.file_id).toBe(fileId);

      const found = await fileMethods.findFileById(fileId);
      expect(found).toBeNull();
    });
  });
});
