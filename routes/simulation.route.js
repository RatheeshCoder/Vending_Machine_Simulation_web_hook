import express from "express";
import * as controller from "../controllers/simulation.controller.js"; // ✅ Added .js extension

const router = express.Router();

/* =========================================================================
   1. SIMULATION CONTROL ROUTES (The "Sender")
   ========================================================================= */

// 1️⃣ MANUAL ONE-SHOT SIMULATION
router.post(
  "/machines/:machineId/simulate",
  controller.simulateOnce
);

// 2️⃣ START SIMULATION LOOP
router.post(
  "/machines/:machineId/start",
  controller.startSimulation
);

// 3️⃣ STOP SIMULATION LOOP
router.post(
  "/machines/:machineId/stop",
  controller.stopSimulation
);

// 4️⃣ GET CURRENT SIMULATION STATUS
router.get(
  "/machines/:machineId/status",
  controller.getSimulationStatus
);

/* =========================================================================
   2. DATA INGESTION ROUTES (The "Receiver")
   ========================================================================= */

// 7️⃣ RECEIVE WEBHOOK DATA
router.post(
  "/ingest/:machineId",
  controller.receiveWebhook
);

export default router;