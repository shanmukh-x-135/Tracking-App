import { applyMutation } from "@/lib/persistence/domain";
import { emptyMosaicState, type MosaicState, type PersistenceGateway } from "@/lib/persistence/types";

function storageKey(userId: string): string { return `mosaic:state:${userId}`; }

function read(userId: string): MosaicState {
  const value = window.localStorage.getItem(storageKey(userId));
  if (!value) return emptyMosaicState();
  try { return { ...emptyMosaicState(), ...JSON.parse(value) as MosaicState }; } catch { return emptyMosaicState(); }
}

export const mockPersistenceGateway: PersistenceGateway = {
  async load(userId) { return read(userId); },
  async mutate(userId, mutation) {
    const state = applyMutation(read(userId), mutation);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
    return state;
  },
};
