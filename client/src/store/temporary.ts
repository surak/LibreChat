import { atomWithLocalStorage } from '~/store/utils';

const isTemporary = atomWithLocalStorage('isTemporary', true);
const defaultTemporaryChat = atomWithLocalStorage('defaultTemporaryChat', true);

export default {
  isTemporary,
  defaultTemporaryChat,
};
