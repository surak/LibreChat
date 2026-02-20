import { nanoid } from 'nanoid';

const bannerStore = new Map<string, any>();

export function createBannerMethods() {
  async function findBanners(filter: any = {}) {
    return Array.from(bannerStore.values()).filter(b => {
      for (const key in filter) {
        if (b[key] !== filter[key]) return false;
      }
      return true;
    });
  }

  async function findOneBanner(filter: any = {}) {
    const banners = await findBanners(filter);
    return banners[0] || null;
  }

  async function findOneAndUpdateBanner(filter: any, update: any, options: any = {}) {
    let banner = await findOneBanner(filter);
    if (!banner) {
      if (options.upsert) {
        const id = nanoid();
        banner = {
          _id: id,
          ...filter,
          ...update,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        bannerStore.set(id, banner);
        return banner;
      }
      return null;
    }

    const data = update.$set || update;
    Object.assign(banner, data);
    banner.updatedAt = new Date();
    return banner;
  }

  async function findOneAndDeleteBanner(filter: any) {
    const banner = await findOneBanner(filter);
    if (banner) {
      bannerStore.delete(banner._id);
    }
    return banner;
  }

  async function deleteManyBanners(filter: any) {
    const banners = await findBanners(filter);
    for (const banner of banners) {
      bannerStore.delete(banner._id);
    }
    return { deletedCount: banners.length };
  }

  return {
    findBanners,
    findOneBanner,
    findOneAndUpdateBanner,
    findOneAndDeleteBanner,
    deleteManyBanners,
  };
}

export type BannerMethods = ReturnType<typeof createBannerMethods>;
