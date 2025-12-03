/**
 * MULTI-TANK INDUSTRIAL SIMULATION SYSTEM
 * Updated to use proper enum values
 */

// --- Constants ---
const MAX_PAYLOAD_HISTORY = 20;
const WEBHOOK_URL_BASE = "https://vending-machine-simulation-web-hook.onrender.com/api/v1/simulation/ingest";

// --- ENUMS (matching your schema) ---
export const MACHINE_STATUS = {
  ONLINE: "online",
  OFFLINE: "offline",
  MAINTENANCE: "maintenance",
  ERROR: "error",
};

export const CONNECTION_STATE = {
  ONLINE: "online",
  OFFLINE: "offline",
  MAINTENANCE: "maintenance",
};

export const SYSTEM_STATUS = {
  OPERATIONAL: "operational",
  WARNING: "warning",
  ERROR: "error",
  MAINTENANCE: "maintenance",
};

/* =========================================================================
   SIMULATION STATE (in-memory)
   ========================================================================= */
const SIMULATION_STATE = {};

/* =========================================================================
   MOCK MACHINES WITH MULTI-TANK CONFIGURATIONS
   ========================================================================= */
const MOCK_MACHINES = {
    "machine_001": {
        id: "machine_001",
        name: "RO Water Dispenser - Building A",
        location: "Factory Floor 1",
        status: MACHINE_STATUS.ONLINE,
        webhook_key: "test_key_001",
        default_profile: "RO_WATER",
        tank_configuration: {
            raw_water_tank: { capacity_liters: 5000, product: "Raw Water" },
            filtered_water_tank: { capacity_liters: 3000, product: "Filtered Water" },
            ro_water_tank: { capacity_liters: 2000, product: "RO Purified Water" }
        }
    },
    "machine_002": {
        id: "machine_002",
        name: "Milk Cooler - Cafeteria",
        location: "Building B - Level 2",
        status: MACHINE_STATUS.ONLINE,
        webhook_key: "test_key_002",
        default_profile: "MILK_MACHINE",
        tank_configuration: {
            whole_milk_tank: { capacity_liters: 500, product: "Whole Milk" },
            skim_milk_tank: { capacity_liters: 500, product: "Skim Milk" },
            chocolate_milk_tank: { capacity_liters: 300, product: "Chocolate Milk" },
            cream_tank: { capacity_liters: 200, product: "Fresh Cream" }
        }
    },
    "machine_003": {
        id: "machine_003",
        name: "Juice Dispenser - Lobby",
        location: "Main Entrance",
        status: MACHINE_STATUS.ONLINE,
        webhook_key: null,
        default_profile: "JUICE_SODA_MACHINE",
        tank_configuration: {
            cola_syrup_tank: { capacity_liters: 100, product: "Cola Syrup" },
            orange_syrup_tank: { capacity_liters: 100, product: "Orange Syrup" },
            lemon_syrup_tank: { capacity_liters: 100, product: "Lemon Syrup" },
            water_tank: { capacity_liters: 500, product: "Carbonated Water" },
            co2_tank: { capacity_liters: 50, product: "CO2 Gas", is_gas: true }
        }
    },
    "machine_004": {
        id: "machine_004",
        name: "Diesel Pump - Warehouse",
        location: "Storage Area 3",
        status: MACHINE_STATUS.ONLINE,
        webhook_key: "test_key_004",
        default_profile: "DIESEL_DISPENSER",
        tank_configuration: {
            diesel_storage_tank: { capacity_liters: 10000, product: "Diesel Fuel" },
            additive_tank: { capacity_liters: 500, product: "Diesel Additive" },
            waste_tank: { capacity_liters: 200, product: "Waste/Spillage" }
        }
    }
};

/* =========================================================================
   UTILITY HELPERS
   ========================================================================= */
const uid = (() => {
    let cnt = 0;
    return () => `${Date.now().toString(36)}-${(++cnt).toString(36)}`;
})();

const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
const rand = (min, max, decimals = 2) => Number((Math.random() * (max - min) + min).toFixed(decimals));
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const randGaussian = (mean, stdDev) => {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z0 * stdDev;
};

const smoothTowards = (prev, target, fraction = 0.08) => {
    if (typeof prev !== "number") return target;
    return prev + (target - prev) * fraction;
};

/* =========================================================================
   TANK SENSOR GENERATION
   ========================================================================= */
const generateTankSensors = (tankId, tankConfig, lastValues, isGas = false) => {
    const prevData = lastValues[tankId] || {};
    
    // Base level (slowly decreases with usage)
    let level_percent = prevData.level_percent !== undefined 
        ? prevData.level_percent - rand(0.05, 0.5) 
        : rand(60, 95);
    level_percent = clamp(level_percent, 0, 100);
    
    // Calculate volume
    const volume_liters = Number((level_percent / 100 * tankConfig.capacity_liters).toFixed(2));
    
    // Temperature varies by product type
    let temperature_target = isGas ? rand(-5, 10) : rand(2, 25);
    const temperature = Number(smoothTowards(prevData.temperature, temperature_target, 0.1).toFixed(2));
    
    // Pressure (higher for gas tanks)
    let pressure_target = isGas ? rand(50, 150) : rand(0.5, 5);
    const pressure = Number(smoothTowards(prevData.pressure, pressure_target, 0.1).toFixed(2));
    
    // Flow rate (varies with usage)
    const flow_rate = Number(rand(0, 15).toFixed(2));
    
    // Quality metrics
    const quality_index = Number(rand(85, 100).toFixed(2));
    const contamination_ppm = Number(rand(0, 5).toFixed(2));
    const ph_level = Number(rand(6.5, 8.5).toFixed(2));
    
    // Valve and pump states
    const inlet_valve_status = ["open", "closed", "partial"][randInt(0, 2)];
    const outlet_valve_status = ["open", "closed", "partial"][randInt(0, 2)];
    const pump_status = ["running", "idle", "fault", "maintenance"][randInt(0, 3)];
    const pump_speed_rpm = pump_status === "running" ? randInt(800, 3000) : 0;
    
    // Alert conditions
    const alerts = [];
    if (level_percent < 20) alerts.push("LOW_LEVEL");
    if (level_percent > 95) alerts.push("HIGH_LEVEL");
    if (temperature > 20) alerts.push("HIGH_TEMPERATURE");
    if (contamination_ppm > 3) alerts.push("CONTAMINATION_DETECTED");
    if (pressure > (isGas ? 140 : 4.5)) alerts.push("HIGH_PRESSURE");
    
    return {
        tank_id: tankId,
        product_name: tankConfig.product,
        capacity_liters: tankConfig.capacity_liters,
        
        // Level sensors
        level_percent,
        volume_liters,
        volume_remaining_liters: volume_liters,
        empty_in_hours: volume_liters > 0 ? Number((volume_liters / (flow_rate || 1)).toFixed(2)) : 0,
        
        // Environmental sensors
        temperature_celsius: temperature,
        pressure_bar: pressure,
        humidity_percent: Number(rand(30, 70).toFixed(2)),
        
        // Flow sensors
        flow_rate_lpm: flow_rate,
        total_flow_today_liters: Number(rand(50, 500).toFixed(2)),
        flow_direction: flow_rate > 5 ? "outbound" : flow_rate > 0.5 ? "inbound" : "static",
        
        // Quality sensors
        quality_index_percent: quality_index,
        contamination_ppm,
        ph_level,
        conductivity_ms_cm: Number(rand(0.5, 2.5).toFixed(2)),
        turbidity_ntu: Number(rand(0.1, 5).toFixed(2)),
        dissolved_oxygen_mg_l: Number(rand(5, 9).toFixed(2)),
        
        // Valve states
        inlet_valve_status,
        inlet_valve_position_percent: inlet_valve_status === "open" ? 100 : 
                                      inlet_valve_status === "partial" ? randInt(20, 80) : 0,
        outlet_valve_status,
        outlet_valve_position_percent: outlet_valve_status === "open" ? 100 : 
                                        outlet_valve_status === "partial" ? randInt(20, 80) : 0,
        
        // Pump data
        pump_status,
        pump_speed_rpm,
        pump_power_watts: pump_status === "running" ? randInt(200, 1500) : 0,
        pump_efficiency_percent: pump_status === "running" ? Number(rand(75, 95).toFixed(2)) : 0,
        pump_vibration_mm_s: Number(rand(0.5, 5).toFixed(2)),
        
        // Maintenance & alerts
        last_cleaned: new Date(Date.now() - randInt(1, 30) * 86400000).toISOString(),
        next_maintenance_days: randInt(5, 90),
        alerts,
        alert_count: alerts.length,
        
        // Timestamps
        last_updated: new Date().toISOString()
    };
};

/* =========================================================================
   MACHINE-LEVEL SENSORS
   ========================================================================= */
const generateMachineLevelSensors = (profile) => {
    // Randomly select system status using enum
    const systemStatuses = Object.values(SYSTEM_STATUS);
    const randomSystemStatus = systemStatuses[randInt(0, systemStatuses.length - 1)];
    
    // Randomly select network status using enum
    const networkStatuses = Object.values(CONNECTION_STATE);
    const randomNetworkStatus = networkStatuses[randInt(0, networkStatuses.length - 1)];
    
    return {
        // Main system status (using enum)
        system_status: randomSystemStatus,
        operating_mode: profile.operatingMode,
        
        // Power & electrical
        voltage_primary: Number(rand(200, 240).toFixed(2)),
        voltage_secondary: Number(rand(22, 26).toFixed(2)),
        current_amps: Number(rand(5, 50).toFixed(2)),
        power_consumption_kw: Number(rand(1, 15).toFixed(2)),
        power_factor: Number(rand(0.85, 0.98).toFixed(2)),
        frequency_hz: Number(rand(49.5, 50.5).toFixed(2)),
        
        // Environmental (machine room/cabinet)
        ambient_temperature_celsius: Number(rand(18, 35).toFixed(2)),
        cabinet_temperature_celsius: Number(rand(25, 45).toFixed(2)),
        ambient_humidity_percent: Number(rand(30, 70).toFixed(2)),
        
        // Control system
        controller_cpu_percent: Number(rand(10, 60).toFixed(2)),
        controller_memory_percent: Number(rand(20, 70).toFixed(2)),
        controller_temperature_celsius: Number(rand(35, 65).toFixed(2)),
        
        // Network & communication (using enum)
        network_status: randomNetworkStatus,
        signal_strength_dbm: randInt(-95, -40),
        packet_loss_percent: Number(rand(0, 5).toFixed(2)),
        latency_ms: randInt(10, 200),
        
        // Operational counters
        total_runtime_hours: randInt(1000, 50000),
        cycles_completed_today: randInt(10, 500),
        error_count_today: randInt(0, 5),
        warning_count_today: randInt(0, 10),
        
        // Safety systems
        emergency_stop_status: "RELEASED",
        door_interlock_status: Math.random() > 0.9 ? "OPEN" : "CLOSED",
        safety_relay_status: "OK",
        ground_fault_status: "OK"
    };
};

/* =========================================================================
   GENERATE COMPLETE MULTI-TANK PAYLOAD
   ========================================================================= */
const generateSensorPayload = (machineId, state) => {
    const machine = MOCK_MACHINES[machineId];
    const profile = PROFILES[state.profile];
    const payload = {
        machine_id: machineId,
        timestamp: new Date().toISOString(),
        sequence: state.sequence + 1,
        
        machine_info: {
            id: machine.id,
            name: machine.name,
            location: machine.location,
            profile: state.profile,
            profile_name: profile.name
        },
        
        tanks: {},
        machine_sensors: {},
        aggregated_data: {},
        health: {},
        alarms: [],
        maintenance: {},
        production_stats: {}
    };
    
    // --- 1. GENERATE DATA FOR EACH TANK ---
    let total_volume = 0;
    let total_capacity = 0;
    let active_alerts = [];
    
    for (const [tankId, tankConfig] of Object.entries(machine.tank_configuration)) {
        const tankData = generateTankSensors(
            tankId, 
            tankConfig, 
            state.tankValues, 
            tankConfig.is_gas
        );
        
        payload.tanks[tankId] = tankData;
        
        // Store for next iteration
        state.tankValues[tankId] = {
            level_percent: tankData.level_percent,
            temperature: tankData.temperature_celsius,
            pressure: tankData.pressure_bar
        };
        
        // Aggregate
        total_volume += tankData.volume_liters;
        total_capacity += tankConfig.capacity_liters;
        active_alerts.push(...tankData.alerts);
    }
    
    // --- 2. MACHINE-LEVEL SENSORS ---
    payload.machine_sensors = generateMachineLevelSensors(profile);
    
    // --- 3. AGGREGATED DATA ---
    payload.aggregated_data = {
        total_tanks: Object.keys(machine.tank_configuration).length,
        total_volume_liters: Number(total_volume.toFixed(2)),
        total_capacity_liters: total_capacity,
        overall_fill_percent: Number((total_volume / total_capacity * 100).toFixed(2)),
        active_alert_count: active_alerts.length,
        tanks_below_20_percent: Object.values(payload.tanks).filter(t => t.level_percent < 20).length,
        average_tank_temperature: Number((Object.values(payload.tanks)
            .reduce((sum, t) => sum + t.temperature_celsius, 0) / 
            Object.keys(payload.tanks).length).toFixed(2)),
        total_flow_rate_lpm: Number(Object.values(payload.tanks)
            .reduce((sum, t) => sum + t.flow_rate_lpm, 0).toFixed(2))
    };
    
    // --- 4. HEALTH METRICS (using enums) ---
    payload.health = {
        overall_status: payload.machine_sensors.system_status,
        uptime_seconds: state.uptime + Math.round(state.intervalMs / 1000),
        connection_state: payload.machine_sensors.network_status,
        firmware_version: "3.2.1",
        last_boot: state.createdAt,
        error_count: payload.machine_sensors.error_count_today,
        warning_count: payload.machine_sensors.warning_count_today
    };
    state.uptime = payload.health.uptime_seconds;
    
    // --- 5. ALARMS (from all tanks) ---
    const alarmMap = {};
    Object.entries(payload.tanks).forEach(([tankId, tankData]) => {
        tankData.alerts.forEach(alert => {
            const key = `${tankId}_${alert}`;
            if (!alarmMap[key]) {
                payload.alarms.push({
                    id: uid(),
                    severity: alert.includes("HIGH") || alert.includes("LOW") ? "WARNING" : "INFO",
                    tank_id: tankId,
                    type: alert,
                    message: `${alert.replace(/_/g, ' ')} detected in ${tankData.product_name}`,
                    timestamp: new Date().toISOString()
                });
                alarmMap[key] = true;
            }
        });
    });
    
    // --- 6. MAINTENANCE SCHEDULES ---
    payload.maintenance = {
        upcoming_tasks: Object.entries(payload.tanks).map(([tankId, data]) => ({
            tank_id: tankId,
            task: "Routine Cleaning",
            due_in_days: data.next_maintenance_days,
            last_performed: data.last_cleaned
        })),
        machine_next_service_days: randInt(10, 90),
        filter_replacement_due_days: randInt(5, 60),
        calibration_due_days: randInt(30, 180)
    };
    
    // --- 7. PRODUCTION STATISTICS ---
    payload.production_stats = {
        daily_production_liters: Number(Object.values(payload.tanks)
            .reduce((sum, t) => sum + t.total_flow_today_liters, 0).toFixed(2)),
        efficiency_percent: Number(rand(75, 98).toFixed(2)),
        downtime_minutes_today: randInt(0, 60),
        cycles_completed: payload.machine_sensors.cycles_completed_today,
        quality_index_average: Number((Object.values(payload.tanks)
            .reduce((sum, t) => sum + t.quality_index_percent, 0) / 
            Object.keys(payload.tanks).length).toFixed(2))
    };
    
    state.sequence = payload.sequence;
    state.payloadHistory.push(payload);
    if (state.payloadHistory.length > MAX_PAYLOAD_HISTORY) {
        state.payloadHistory.shift();
    }
    
    return payload;
};

/* =========================================================================
   PROFILES (simplified for multi-tank system)
   ========================================================================= */
const PROFILES = {
    RO_WATER: {
        name: "RO Water Purification System",
        description: "Multi-stage water treatment with 3 tanks",
        defaultIntervalMs: 5000,
        operatingMode: "continuous"
    },
    MILK_MACHINE: {
        name: "Refrigerated Milk Dispensing System",
        description: "4-tank milk storage and dispensing",
        defaultIntervalMs: 7000,
        operatingMode: "continuous"
    },
    JUICE_SODA_MACHINE: {
        name: "Carbonated Beverage Dispenser",
        description: "5-tank fountain drink system",
        defaultIntervalMs: 4000,
        operatingMode: "on-demand"
    },
    DIESEL_DISPENSER: {
        name: "Industrial Fuel Dispenser",
        description: "3-tank diesel storage and distribution",
        defaultIntervalMs: 8000,
        operatingMode: "batch"
    }
};

/* =========================================================================
   WEBHOOK SENDER
   ========================================================================= */
const sendWebhook = async (machineId) => {
    const machine = MOCK_MACHINES[machineId];
    const state = SIMULATION_STATE[machineId];
    if (!machine || !state) return;

    const payload = generateSensorPayload(machineId, state);
    
    if (payload.alarms.length > 0) {
        console.log(`\n⚠️  ALARMS (${payload.alarms.length}):`);
        payload.alarms.forEach(alarm => {
            console.log(`   • [${alarm.severity}] ${alarm.message}`);
        });
    }
    
    const webhookUrl = `${WEBHOOK_URL_BASE}/${machineId}`;
    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Machine-ID": machineId
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            console.log(`✅ Webhook Delivered: ${machine.name} → Status: ${res.status}`);
        } else {
            console.warn(`❌ Webhook Error: Status ${res.status}`);
        }
    } catch (err) {
        console.error(`❌ Failed to POST webhook:`, err.message);
    }
};

/* =========================================================================
   CONTROLLER FUNCTIONS
   ========================================================================= */
const initializeMachineState = (machineId, profileKey) => {
    const profile = PROFILES[profileKey];
    const machine = MOCK_MACHINES[machineId];
    if (!profile || !machine) return null;

    if (SIMULATION_STATE[machineId]?.intervalHandle) {
        clearInterval(SIMULATION_STATE[machineId].intervalHandle);
    }

    return SIMULATION_STATE[machineId] = {
        running: false,
        profile: profileKey,
        intervalMs: profile.defaultIntervalMs,
        intervalHandle: null,
        sequence: 0,
        uptime: 0,
        tankValues: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        payloadHistory: []
    };
};

export const startSimulation = async (req, res) => {
    const { machineId } = req.params;
    const machine = MOCK_MACHINES[machineId];
    if (!machine) {
        return res.status(404).json({ success: false, message: "Machine not found" });
    }

    let state = SIMULATION_STATE[machineId];
    if (!state) {
        state = initializeMachineState(machineId, machine.default_profile);
    }

    if (state.running) {
        return res.status(200).json({ success: true, message: "Simulation already running" });
    }

    state.running = true;
    state.intervalHandle = setInterval(() => sendWebhook(machineId), state.intervalMs);
    setTimeout(() => sendWebhook(machineId), 100);

    res.json({
        success: true,
        message: `Multi-tank simulation started for ${machine.name}`,
        tanks: Object.keys(machine.tank_configuration),
        intervalMs: state.intervalMs
    });
};

export const stopSimulation = async (req, res) => {
    const { machineId } = req.params;
    const state = SIMULATION_STATE[machineId];

    if (state && state.running) {
        clearInterval(state.intervalHandle);
        state.running = false;
        state.intervalHandle = null;
        res.json({ success: true, message: "Simulation stopped" });
    } else {
        res.status(400).json({ success: false, message: "Simulation not running" });
    }
};

export const simulateOnce = async (req, res) => {
    const { machineId } = req.params;
    const machine = MOCK_MACHINES[machineId];
    if (!machine) {
        return res.status(404).json({ success: false, message: "Machine not found" });
    }

    let state = SIMULATION_STATE[machineId];
    if (!state) {
        state = initializeMachineState(machineId, machine.default_profile);
    }

    await sendWebhook(machineId);
    res.json({ success: true, message: "Manual webhook triggered" });
};

export const getSimulationStatus = (req, res) => {
    const { machineId } = req.params;
    const machine = MOCK_MACHINES[machineId];
    const state = SIMULATION_STATE[machineId];

    if (!machine) {
        return res.status(404).json({ success: false, message: "Machine not found" });
    }

    res.json({
        success: true,
        status: {
            machineId,
            name: machine.name,
            running: !!state?.running,
            tanks: Object.keys(machine.tank_configuration),
            lastPayload: state?.payloadHistory[state.payloadHistory.length - 1] || null
        }
    });
};

export const receiveWebhook = async (req, res) => {
    try {
        const { machineId } = req.params;
        const payload = req.body;

        return res.status(200).json({
            success: true,
            message: "Complete multi-tank data received",
            summary: {
                tanks_received: Object.keys(payload.tanks || {}).length,
                total_sensors: Object.keys(payload.machine_sensors || {}).length,
                alarms: (payload.alarms || []).length
            }
        });
    } catch (error) {
        console.error("❌ Error:", error);
        return res.status(500).json({ success: false, message: "Error processing data" });
    }
};

export const listSimulatedMachines = (req, res) => {
    res.json({
        success: true,
        machines: Object.values(MOCK_MACHINES).map(m => ({
            machineId: m.id,
            name: m.name,
            location: m.location,
            tanks: Object.keys(m.tank_configuration),
            running: !!SIMULATION_STATE[m.id]?.running
        }))
    });
};