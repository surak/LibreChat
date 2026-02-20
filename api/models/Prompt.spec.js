const {
  getPromptGroups,
  deletePromptGroup,
  getAllPromptGroups,
  createPromptGroup,
  savePrompt,
  getPrompts,
  getPrompt,
} = require('./Prompt');

describe('Prompt Operations', () => {
  let authorId = 'user123';

  test('should create and get a prompt group', async () => {
    const saveData = {
      prompt: { prompt: 'Hello', name: 'Test' },
      group: { name: 'Test Group', category: 'misc' },
      author: authorId,
      authorName: 'User'
    };

    const result = await createPromptGroup(saveData);
    expect(result.group.name).toBe('Test Group');
    expect(result.prompt.prompt).toBe('Hello');

    const groups = await getAllPromptGroups({}, { author: authorId });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Test Group');
  });

  test('should save and get a prompt', async () => {
    const saveData = {
      prompt: { prompt: 'New Prompt', name: 'P1' },
      author: authorId
    };
    const result = await savePrompt(saveData);
    const retrieved = await getPrompt({ id: result.prompt.id });
    expect(retrieved.prompt).toBe('New Prompt');
  });

  test('should delete a prompt group', async () => {
    const result = await createPromptGroup({
      prompt: { prompt: 'To delete' },
      group: { name: 'DGroup' },
      author: authorId
    });
    const groupId = result.group._id;
    await deletePromptGroup({ _id: groupId, author: authorId });

    const groups = await getAllPromptGroups({}, { author: authorId });
    expect(groups.find(g => g._id === groupId)).toBeUndefined();
  });
});
