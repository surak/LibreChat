const { v4: uuidv4 } = require('uuid');
const {
  findFileById,
  getFiles,
  createFile,
  updateFile,
  deleteFile,
} = require('./File');

describe('File Operations', () => {
  let userId = 'user123';

  test('should create and get a file', async () => {
    const fileId = uuidv4();
    const newFile = await createFile({
      file_id: fileId,
      filename: 'test.txt',
      user: userId,
    });

    expect(newFile.file_id).toBe(fileId);
    const retrieved = await findFileById(fileId);
    expect(retrieved.filename).toBe('test.txt');
  });

  test('should update a file', async () => {
    const fileId = uuidv4();
    await createFile({ file_id: fileId, filename: 'old.txt', user: userId });
    const updated = await updateFile({ file_id: fileId, filename: 'new.txt' });
    expect(updated.filename).toBe('new.txt');
  });

  test('should delete a file', async () => {
    const fileId = uuidv4();
    await createFile({ file_id: fileId, filename: 'to-delete.txt', user: userId });
    await deleteFile(fileId);
    const retrieved = await findFileById(fileId);
    expect(retrieved).toBeUndefined();
  });

  test('should get files by filter', async () => {
    const fileId1 = uuidv4();
    const fileId2 = uuidv4();
    await createFile({ file_id: fileId1, filename: 'a.txt', user: userId });
    await createFile({ file_id: fileId2, filename: 'b.txt', user: 'other' });

    const files = await getFiles({ user: userId });
    expect(files).toHaveLength(1);
    expect(files[0].file_id).toBe(fileId1);
  });
});
