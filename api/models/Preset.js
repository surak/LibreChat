const { logger } = require('@librechat/data-schemas');

// In-memory store for presets
const presetStore = new Map();

const getPreset = async (user, presetId) => {
  try {
    const preset = presetStore.get(presetId);
    if (preset && preset.user === user) {
      return preset;
    }
    return null;
  } catch (error) {
    logger.error('[getPreset] Error getting single preset', error);
    return { message: 'Error getting single preset' };
  }
};

module.exports = {
  getPreset,
  getPresets: async (user, filter) => {
    try {
      const presets = Array.from(presetStore.values()).filter((preset) => {
        if (preset.user !== user) return false;
        for (const key in filter) {
          if (preset[key] !== filter[key]) return false;
        }
        return true;
      });

      const defaultValue = 10000;

      presets.sort((a, b) => {
        let orderA = a.order !== undefined ? a.order : defaultValue;
        let orderB = b.order !== undefined ? b.order : defaultValue;

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return b.updatedAt - a.updatedAt;
      });

      return presets;
    } catch (error) {
      logger.error('[getPresets] Error getting presets', error);
      return { message: 'Error retrieving presets' };
    }
  },
  savePreset: async (user, { presetId, newPresetId, defaultPreset, ...preset }) => {
    try {
      const targetId = newPresetId || presetId;
      const update = { presetId: targetId, ...preset, user, updatedAt: new Date() };

      if (preset.tools && Array.isArray(preset.tools)) {
        update.tools =
          preset.tools
            .map((tool) => tool?.pluginKey ?? tool)
            .filter((toolName) => typeof toolName === 'string') ?? [];
      }

      if (defaultPreset) {
        update.defaultPreset = defaultPreset;
        update.order = 0;

        for (const [id, p] of presetStore.entries()) {
           if (p.user === user && p.defaultPreset && id !== targetId) {
             p.defaultPreset = undefined;
             p.order = undefined;
             presetStore.set(id, p);
           }
        }
      }

      presetStore.set(targetId, update);
      return update;
    } catch (error) {
      logger.error('[savePreset] Error saving preset', error);
      return { message: 'Error saving preset' };
    }
  },
  deletePresets: async (user, filter) => {
    let count = 0;
    for (const [id, preset] of presetStore.entries()) {
      if (preset.user === user) {
        let match = true;
        for (const key in filter) {
          if (preset[key] !== filter[key]) {
            match = false;
            break;
          }
        }
        if (match) {
          presetStore.delete(id);
          count++;
        }
      }
    }
    return { deletedCount: count };
  },
};
