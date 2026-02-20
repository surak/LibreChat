import type { IAgentCategory } from '~/types';
import { nanoid } from 'nanoid';

const agentCategoryStore = new Map<string, IAgentCategory>();

// Factory function that returns the methods
export function createAgentCategoryMethods() {
  /**
   * Get all active categories sorted by order
   */
  async function getActiveCategories(): Promise<IAgentCategory[]> {
    const categories = Array.from(agentCategoryStore.values()).filter(c => c.isActive);
    categories.sort((a, b) => (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label));
    return categories;
  }

  /**
   * Get categories with agent counts
   */
  async function getCategoriesWithCounts(): Promise<(IAgentCategory & { agentCount: number })[]> {
    // Note: Since Agent store is not here, we return 0 for now.
    // In a real stateless app, this would be computed from the agent store.
    const categories = await getActiveCategories();
    return categories.map((category) => ({
      ...category,
      agentCount: 0,
    }));
  }

  /**
   * Get valid category values
   */
  async function getValidCategoryValues(): Promise<string[]> {
    return Array.from(agentCategoryStore.values()).filter(c => c.isActive).map(c => c.value);
  }

  /**
   * Seed initial categories
   */
  async function seedCategories(
    categories: Array<{
      value: string;
      label?: string;
      description?: string;
      order?: number;
      custom?: boolean;
    }>,
  ): Promise<any> {
    let createdCount = 0;
    categories.forEach((category, index) => {
      if (!agentCategoryStore.has(category.value)) {
        const newCat: IAgentCategory = {
          _id: nanoid(),
          value: category.value,
          label: category.label || category.value,
          description: category.description || '',
          order: category.order || index,
          isActive: true,
          custom: category.custom || false,
        } as any;
        agentCategoryStore.set(category.value, newCat);
        createdCount++;
      }
    });
    return { nUpserted: createdCount };
  }

  /**
   * Find a category by value
   */
  async function findCategoryByValue(value: string): Promise<IAgentCategory | null> {
    return agentCategoryStore.get(value) || null;
  }

  /**
   * Create a new category
   */
  async function createCategory(categoryData: Partial<IAgentCategory>): Promise<IAgentCategory> {
    const value = categoryData.value as string;
    const newCat: IAgentCategory = {
      _id: nanoid(),
      ...categoryData,
      isActive: true,
    } as any;
    agentCategoryStore.set(value, newCat);
    return newCat;
  }

  /**
   * Update a category by value
   */
  async function updateCategory(
    value: string,
    updateData: Partial<IAgentCategory>,
  ): Promise<IAgentCategory | null> {
    const existing = agentCategoryStore.get(value);
    if (!existing) return null;
    const updated = { ...existing, ...updateData };
    agentCategoryStore.set(value, updated);
    return updated;
  }

  /**
   * Delete a category by value
   */
  async function deleteCategory(value: string): Promise<boolean> {
    return agentCategoryStore.delete(value);
  }

  /**
   * Find a category by ID
   */
  async function findCategoryById(id: string): Promise<IAgentCategory | null> {
    return Array.from(agentCategoryStore.values()).find(c => c._id === id) || null;
  }

  /**
   * Get all categories
   */
  async function getAllCategories(): Promise<IAgentCategory[]> {
    const categories = Array.from(agentCategoryStore.values());
    categories.sort((a, b) => (a.order || 0) - (b.order || 0) || a.label.localeCompare(b.label));
    return categories;
  }

  /**
   * Ensure default categories exist
   */
  async function ensureDefaultCategories(): Promise<boolean> {
    const defaultCategories = [
      {
        value: 'general',
        label: 'com_agents_category_general',
        description: 'com_agents_category_general_description',
        order: 0,
      },
      {
        value: 'hr',
        label: 'com_agents_category_hr',
        description: 'com_agents_category_hr_description',
        order: 1,
      },
      {
        value: 'rd',
        label: 'com_agents_category_rd',
        description: 'com_agents_category_rd_description',
        order: 2,
      },
      {
        value: 'finance',
        label: 'com_agents_category_finance',
        description: 'com_agents_category_finance_description',
        order: 3,
      },
      {
        value: 'it',
        label: 'com_agents_category_it',
        description: 'com_agents_category_it_description',
        order: 4,
      },
      {
        value: 'sales',
        label: 'com_agents_category_sales',
        description: 'com_agents_category_sales_description',
        order: 5,
      },
      {
        value: 'aftersales',
        label: 'com_agents_category_aftersales',
        description: 'com_agents_category_aftersales_description',
        order: 6,
      },
    ];

    let changed = false;
    for (const defaultCategory of defaultCategories) {
      const existingCategory = agentCategoryStore.get(defaultCategory.value);
      if (!existingCategory) {
        await createCategory({
          ...defaultCategory,
          custom: false,
        });
        changed = true;
      } else {
        if (!existingCategory.custom && !existingCategory.label.startsWith('com_')) {
           existingCategory.label = defaultCategory.label;
           existingCategory.description = defaultCategory.description;
           agentCategoryStore.set(defaultCategory.value, existingCategory);
           changed = true;
        }
      }
    }

    return changed;
  }

  return {
    getActiveCategories,
    getCategoriesWithCounts,
    getValidCategoryValues,
    seedCategories,
    findCategoryByValue,
    createCategory,
    updateCategory,
    deleteCategory,
    findCategoryById,
    getAllCategories,
    ensureDefaultCategories,
  };
}

export type AgentCategoryMethods = ReturnType<typeof createAgentCategoryMethods>;
