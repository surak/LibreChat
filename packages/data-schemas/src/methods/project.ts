import { nanoid } from 'nanoid';

const projectStore = new Map<string, any>();

export function createProjectMethods() {
  async function findProjects(filter: any = {}) {
    return Array.from(projectStore.values()).filter(p => {
      for (const key in filter) {
        if (p[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneProject(filter: any = {}) {
    const projects = await findProjects(filter);
    return projects[0] || null;
  }

  async function createProject(data: any) {
    const id = nanoid();
    const newProject = {
      _id: id,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    projectStore.set(id, newProject);
    return newProject;
  }

  return {
    findProjects,
    findOneProject,
    createProject,
  };
}

export type ProjectMethods = ReturnType<typeof createProjectMethods>;
