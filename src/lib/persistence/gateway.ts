"use client";

import { getPublicEnvironment } from "@/lib/config/env";
import { livePersistenceGateway } from "@/lib/persistence/live-gateway";
import { mockPersistenceGateway } from "@/lib/persistence/mock-gateway";

export function getPersistenceGateway() {
  return getPublicEnvironment().dataMode === "live" ? livePersistenceGateway : mockPersistenceGateway;
}
