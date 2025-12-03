import express from "express";
import simulationRoutes from "./routes/simulation.route.js";

const app = express();

// Middleware
app.use(express.json());

// Routes
app.use("/api/v1/simulation", simulationRoutes);

export default app;
