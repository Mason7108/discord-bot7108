import express from "express";
import type { Server } from "node:http";
import type { Env } from "../config/env.js";
import { getGuildSettings, updateGuildSettings } from "../core/services/guildSettingsService.js";
import { MODULE_NAMES } from "../core/constants.js";
import { logger } from "../utils/logger.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function pickUpdatableSettings(body: unknown) {
  if (!isObject(body)) {
    return {};
  }

  const payload: Record<string, unknown> = {};
  const allowed = [
    "modules",
    "modLogChannelId",
    "automod",
    "ticketCategoryId",
    "staffRoleIds",
    "levelRoles",
    "economyEnabled",
    "music247Enabled",
    "rolePolicy"
  ];

  for (const key of allowed) {
    if (key in body) {
      payload[key] = body[key];
    }
  }

  if (isObject(payload.modules)) {
    const normalized: Record<string, boolean> = {};
    for (const name of MODULE_NAMES) {
      const raw = payload.modules[name];
      if (typeof raw === "boolean") {
        normalized[name] = raw;
      }
    }
    payload.modules = normalized;
  }

  return payload;
}

export function startApiServer(env: Env): Server | null {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.get("/api/guilds/:guildId/settings", async (req, res) => {
    const settings = await getGuildSettings(req.params.guildId);
    res.json(settings);
  });

  app.patch("/api/guilds/:guildId/settings", async (req, res) => {
    const payload = pickUpdatableSettings(req.body);
    const updated = await updateGuildSettings(req.params.guildId, payload as never);
    res.json(updated);
  });

  try {
    const server = app.listen(env.API_PORT, () => {
      logger.info({ port: env.API_PORT }, "Dashboard API listening");
    });

    server.on("error", (error) => {
      logger.error({ err: error, port: env.API_PORT }, "Dashboard API server error");
    });

    return server;
  } catch (error) {
    logger.error({ err: error, port: env.API_PORT }, "Dashboard API failed to start");
    return null;
  }
}
