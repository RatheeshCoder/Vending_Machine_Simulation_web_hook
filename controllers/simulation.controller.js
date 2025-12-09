/**
 * MULTI-TANK INDUSTRIAL SIMULATION SYSTEM
 * Updated to use proper enum values with REALISTIC 24-HOUR simulation
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
   REALISTIC TIME-BASED CONSUMPTION CALCULATION
   Calculate realistic consumption based on time of day and usage patterns
   ========================================================================= */
const getRealisticConsumptionRate = (profile, currentHour) => {
    // Define usage patterns for different machine types throughout the day
    const usagePatterns = {
        RO_WATER: {
            // Peak hours: 8-10 AM, 12-2 PM, 5-7 PM (work breaks)
            peakHours: [8, 9, 12, 13, 17, 18],
            lowHours: [0, 1, 2, 3, 4, 5, 22, 23],
            peakRate: 0.015,      // 1.5% per update during peak
            normalRate: 0.008,    // 0.8% per update during normal hours
            lowRate: 0.002        // 0.2% per update during low hours
        },
        MILK_MACHINE: {
            // Peak: breakfast (7-9 AM) and lunch (12-2 PM)
            peakHours: [7, 8, 12, 13],
            lowHours: [0, 1, 2, 3, 4, 5, 6, 20, 21, 22, 23],
            peakRate: 0.012,
            normalRate: 0.006,
            lowRate: 0.001
        },
        JUICE_SODA_MACHINE: {
            // Peak: lunch (12-2 PM) and afternoon (3-5 PM)
            peakHours: [12, 13, 14, 15, 16],
            lowHours: [0, 1, 2, 3, 4, 5, 6, 22, 23],
            peakRate: 0.018,
            normalRate: 0.009,
            lowRate: 0.002
        },
        DIESEL_DISPENSER: {
            // Peak: morning shift start (6-8 AM) and mid-day (11 AM-1 PM)
            peakHours: [6, 7, 11, 12],
            lowHours: [0, 1, 2, 3, 4, 5, 19, 20, 21, 22, 23],
            peakRate: 0.025,
            normalRate: 0.010,
            lowRate: 0.003
        }
    };

    const pattern = usagePatterns[profile];
    if (!pattern) return 0.005; // Default fallback

    if (pattern.peakHours.includes(currentHour)) {
        return pattern.peakRate;
    } else if (pattern.lowHours.includes(currentHour)) {
        return pattern.lowRate;
    } else {
        return pattern.normalRate;
    }
};

/* =========================================================================
   TANK SENSOR GENERATION WITH REALISTIC 24-HOUR SIMULATION
   ========================================================================= */
const generateTankSensors = (tankId, tankConfig, lastValues, isGas = false, profile, intervalMs) => {
    const prevData = lastValues[tankId] || {};
    
    // Get current hour for time-based consumption
    const currentHour = new Date().getHours();
    
    // Calculate realistic consumption rate based on profile and time of day
    const baseConsumptionRate = getRealisticConsumptionRate(profile, currentHour);
    
    // Add small random variation (±20% of base rate)
    const consumptionVariation = rand(0.8, 1.2);
    const actualConsumptionRate = baseConsumptionRate * consumptionVariation;
    
    // Calculate level decrease (much slower now)
    let level_percent = prevData.level_percent !== undefined 
        ? prevData.level_percent - actualConsumptionRate
        : rand(70, 95); // Start with higher initial level
    
    // Ensure level doesn't go below 0
    level_percent = clamp(level_percent, 0, 100);
    
    // Refill logic: if level drops below 15%, simulate refill to 90-95%
    if (level_percent < 15 && Math.random() > 0.7) {
        level_percent = rand(90, 95);
        console.log(`🔄 Tank ${tankId} refilled to ${level_percent.toFixed(2)}%`);
    }
    
    // Calculate volume
    const volume_liters = Number((level_percent / 100 * tankConfig.capacity_liters).toFixed(2));
    
    // Temperature varies by product type - very slow changes
    let temperature_target = isGas ? rand(-5, 10) : rand(2, 25);
    const temperature = Number(smoothTowards(prevData.temperature, temperature_target, 0.02).toFixed(2));
    
    // Pressure (higher for gas tanks) - very slow changes
    let pressure_target = isGas ? rand(50, 150) : rand(0.5, 5);
    const pressure = Number(smoothTowards(prevData.pressure, pressure_target, 0.03).toFixed(2));
    
    // Flow rate based on current consumption (realistic values)
    const flow_rate = level_percent > 10 ? Number((actualConsumptionRate * tankConfig.capacity_liters / 10).toFixed(2)) : 0;
    
    // Quality metrics - very stable over time
    const quality_index = Number(smoothTowards(prevData.quality_index || 95, rand(92, 98), 0.01).toFixed(2));
    const contamination_ppm = Number(smoothTowards(prevData.contamination_ppm || 1, rand(0, 2), 0.01).toFixed(2));
    const ph_level = Number(smoothTowards(prevData.ph_level || 7.2, rand(6.8, 7.8), 0.01).toFixed(2));
    
    // Valve and pump states - more stable (changes less frequently)
    const valve_change_probability = 0.05; // 5% chance of valve state change
    const inlet_valve_status = Math.random() < valve_change_probability 
        ? ["open", "closed", "partial"][randInt(0, 2)]
        : prevData.inlet_valve_status || "open";
    
    const outlet_valve_status = flow_rate > 0.5 
        ? "open" 
        : (Math.random() < valve_change_probability ? "partial" : (prevData.outlet_valve_status || "closed"));
    
    const pump_status = flow_rate > 0.5 
        ? "running" 
        : (Math.random() < 0.02 ? ["idle", "fault", "maintenance"][randInt(0, 2)] : (prevData.pump_status || "idle"));
    
    const pump_speed_rpm = pump_status === "running" 
        ? Number(smoothTowards(prevData.pump_speed_rpm || 1500, randInt(1200, 2800), 0.05))
        : 0;
    
    // Alert conditions
    const alerts = [];
    if (level_percent < 20) alerts.push("LOW_LEVEL");
    if (level_percent > 95) alerts.push("HIGH_LEVEL");
    if (temperature > 20) alerts.push("HIGH_TEMPERATURE");
    if (contamination_ppm > 3) alerts.push("CONTAMINATION_DETECTED");
    if (pressure > (isGas ? 140 : 4.5)) alerts.push("HIGH_PRESSURE");
    
    // Calculate realistic empty time (in hours)
    const empty_in_hours = flow_rate > 0 && volume_liters > 0
        ? Number((volume_liters / (flow_rate * 60)).toFixed(2)) // flow_rate is per minute, so multiply by 60
        : 999;
    
    return {
        tank_id: tankId,
        product_name: tankConfig.product,
        capacity_liters: tankConfig.capacity_liters,
        
        // Level sensors
        level_percent,
        volume_liters,
        volume_remaining_liters: volume_liters,
        empty_in_hours,
        
        // Environmental sensors
        temperature_celsius: temperature,
        pressure_bar: pressure,
        humidity_percent: Number(smoothTowards(prevData.humidity_percent || 50, rand(40, 60), 0.02).toFixed(2)),
        
        // Flow sensors
        flow_rate_lpm: flow_rate,
        total_flow_today_liters: Number(((prevData.total_flow_today_liters || 0) + (flow_rate * intervalMs / 60000)).toFixed(2)),
        flow_direction: flow_rate > 2 ? "outbound" : flow_rate > 0.2 ? "inbound" : "static",
        
        // Quality sensors
        quality_index_percent: quality_index,
        contamination_ppm,
        ph_level,
        conductivity_ms_cm: Number(smoothTowards(prevData.conductivity_ms_cm || 1.5, rand(1.0, 2.0), 0.02).toFixed(2)),
        turbidity_ntu: Number(smoothTowards(prevData.turbidity_ntu || 2, rand(0.5, 3.5), 0.02).toFixed(2)),
        dissolved_oxygen_mg_l: Number(smoothTowards(prevData.dissolved_oxygen_mg_l || 7, rand(6, 8), 0.02).toFixed(2)),
        
        // Valve states
        inlet_valve_status,
        inlet_valve_position_percent: inlet_valve_status === "open" ? 100 : 
                                      inlet_valve_status === "partial" ? randInt(30, 70) : 0,
        outlet_valve_status,
        outlet_valve_position_percent: outlet_valve_status === "open" ? 100 : 
                                        outlet_valve_status === "partial" ? randInt(30, 70) : 0,
        
        // Pump data
        pump_status,
        pump_speed_rpm,
        pump_power_watts: pump_status === "running" ? Number(smoothTowards(prevData.pump_power_watts || 800, randInt(600, 1200), 0.05)) : 0,
        pump_efficiency_percent: pump_status === "running" ? Number(smoothTowards(prevData.pump_efficiency_percent || 85, rand(82, 92), 0.02).toFixed(2)) : 0,
        pump_vibration_mm_s: Number(smoothTowards(prevData.pump_vibration_mm_s || 2, rand(1, 3.5), 0.03).toFixed(2)),
        
        // Maintenance & alerts
        last_cleaned: prevData.last_cleaned || new Date(Date.now() - randInt(1, 30) * 86400000).toISOString(),
        next_maintenance_days: prevData.next_maintenance_days !== undefined 
            ? Math.max(0, prevData.next_maintenance_days - (intervalMs / 86400000))
            : randInt(30, 90),
        alerts,
        alert_count: alerts.length,
        
        // Timestamps
        last_updated: new Date().toISOString()
    };
};

/* =========================================================================
   MACHINE-LEVEL SENSORS WITH REALISTIC VARIATIONS
   ========================================================================= */
const generateMachineLevelSensors = (profile, prevSensors = {}) => {
    // Randomly select system status using enum (but more stable)
    const systemStatuses = Object.values(SYSTEM_STATUS);
    const randomSystemStatus = Math.random() < 0.05 
        ? systemStatuses[randInt(0, systemStatuses.length - 1)]
        : (prevSensors.system_status || SYSTEM_STATUS.OPERATIONAL);
    
    // Randomly select network status using enum (but more stable)
    const networkStatuses = Object.values(CONNECTION_STATE);
    const randomNetworkStatus = Math.random() < 0.03
        ? networkStatuses[randInt(0, networkStatuses.length - 1)]
        : (prevSensors.network_status || CONNECTION_STATE.ONLINE);
    
    return {
        // Main system status (using enum)
        system_status: randomSystemStatus,
        operating_mode: profile.operatingMode,
        
        // Power & electrical - very stable
        voltage_primary: Number(smoothTowards(prevSensors.voltage_primary || 220, rand(218, 232), 0.03).toFixed(2)),
        voltage_secondary: Number(smoothTowards(prevSensors.voltage_secondary || 24, rand(23, 25), 0.03).toFixed(2)),
        current_amps: Number(smoothTowards(prevSensors.current_amps || 25, rand(20, 40), 0.05).toFixed(2)),
        power_consumption_kw: Number(smoothTowards(prevSensors.power_consumption_kw || 8, rand(5, 12), 0.04).toFixed(2)),
        power_factor: Number(smoothTowards(prevSensors.power_factor || 0.92, rand(0.88, 0.96), 0.02).toFixed(2)),
        frequency_hz: Number(smoothTowards(prevSensors.frequency_hz || 50, rand(49.8, 50.2), 0.05).toFixed(2)),
        
        // Environmental (machine room/cabinet) - slow changes
        ambient_temperature_celsius: Number(smoothTowards(prevSensors.ambient_temperature_celsius || 25, rand(22, 30), 0.02).toFixed(2)),
        cabinet_temperature_celsius: Number(smoothTowards(prevSensors.cabinet_temperature_celsius || 35, rand(30, 42), 0.02).toFixed(2)),
        ambient_humidity_percent: Number(smoothTowards(prevSensors.ambient_humidity_percent || 50, rand(40, 65), 0.02).toFixed(2)),
        
        // Control system - very stable
        controller_cpu_percent: Number(smoothTowards(prevSensors.controller_cpu_percent || 35, rand(25, 50), 0.05).toFixed(2)),
        controller_memory_percent: Number(smoothTowards(prevSensors.controller_memory_percent || 45, rand(35, 60), 0.03).toFixed(2)),
        controller_temperature_celsius: Number(smoothTowards(prevSensors.controller_temperature_celsius || 50, rand(45, 60), 0.02).toFixed(2)),
        
        // Network & communication (using enum) - stable
        network_status: randomNetworkStatus,
        signal_strength_dbm: Number(smoothTowards(prevSensors.signal_strength_dbm || -60, randInt(-75, -45), 0.1)),
        packet_loss_percent: Number(smoothTowards(prevSensors.packet_loss_percent || 1, rand(0, 3), 0.05).toFixed(2)),
        latency_ms: Number(smoothTowards(prevSensors.latency_ms || 50, randInt(20, 120), 0.1)),
        
        // Operational counters - increment slowly
        total_runtime_hours: prevSensors.total_runtime_hours !== undefined 
            ? prevSensors.total_runtime_hours + 0.001 
            : randInt(5000, 30000),
        cycles_completed_today: prevSensors.cycles_completed_today !== undefined
            ? prevSensors.cycles_completed_today + (Math.random() < 0.3 ? 1 : 0)
            : randInt(50, 200),
        error_count_today: prevSensors.error_count_today !== undefined
            ? (Math.random() < 0.01 ? prevSensors.error_count_today + 1 : prevSensors.error_count_today)
            : 0,
        warning_count_today: prevSensors.warning_count_today !== undefined
            ? (Math.random() < 0.05 ? prevSensors.warning_count_today + 1 : prevSensors.warning_count_today)
            : randInt(0, 5),
        
        // Safety systems - very stable
        emergency_stop_status: "RELEASED",
        door_interlock_status: Math.random() > 0.98 ? "OPEN" : "CLOSED",
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
            tankConfig.is_gas,
            state.profile,
            state.intervalMs
        );
        
        payload.tanks[tankId] = tankData;
        
        // Store for next iteration - include all changing values
        state.tankValues[tankId] = {
            level_percent: tankData.level_percent,
            temperature: tankData.temperature_celsius,
            pressure: tankData.pressure_bar,
            humidity_percent: tankData.humidity_percent,
            quality_index: tankData.quality_index_percent,
            contamination_ppm: tankData.contamination_ppm,
            ph_level: tankData.ph_level,
            conductivity_ms_cm: tankData.conductivity_ms_cm,
            turbidity_ntu: tankData.turbidity_ntu,
            dissolved_oxygen_mg_l: tankData.dissolved_oxygen_mg_l,
            inlet_valve_status: tankData.inlet_valve_status,
            outlet_valve_status: tankData.outlet_valve_status,
            pump_status: tankData.pump_status,
            pump_speed_rpm: tankData.pump_speed_rpm,
            pump_power_watts: tankData.pump_power_watts,
            pump_efficiency_percent: tankData.pump_efficiency_percent,
            pump_vibration_mm_s: tankData.pump_vibration_mm_s,
            total_flow_today_liters: tankData.total_flow_today_liters,
            last_cleaned: tankData.last_cleaned,
            next_maintenance_days: tankData.next_maintenance_days
        };
        
        // Aggregate
        total_volume += tankData.volume_liters;
        total_capacity += tankConfig.capacity_liters;
        active_alerts.push(...tankData.alerts);
    }
    
    // --- 2. MACHINE-LEVEL SENSORS ---
    payload.machine_sensors = generateMachineLevelSensors(profile, state.machineSensors || {});
    state.machineSensors = payload.machine_sensors; // Store for next iteration
    
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
            due_in_days: Number(data.next_maintenance_days.toFixed(2)),
            last_performed: data.last_cleaned
        })),
        machine_next_service_days: state.machine_next_service_days !== undefined
            ? Math.max(0, state.machine_next_service_days - (state.intervalMs / 86400000))
            : randInt(30, 90),
        filter_replacement_due_days: state.filter_replacement_due_days !== undefined
            ? Math.max(0, state.filter_replacement_due_days - (state.intervalMs / 86400000))
            : randInt(15, 60),
        calibration_due_days: state.calibration_due_days !== undefined
            ? Math.max(0, state.calibration_due_days - (state.intervalMs / 86400000))
            : randInt(60, 180)
    };
    
    // Store maintenance values
    state.machine_next_service_days = payload.maintenance.machine_next_service_days;
    state.filter_replacement_due_days = payload.maintenance.filter_replacement_due_days;
    state.calibration_due_days = payload.maintenance.calibration_due_days;
    
    // --- 7. PRODUCTION STATISTICS ---
    const daily_production = Object.values(payload.tanks)
        .reduce((sum, t) => sum + t.total_flow_today_liters, 0);
    
    payload.production_stats = {
        daily_production_liters: Number(daily_production.toFixed(2)),
        efficiency_percent: Number(smoothTowards(
            state.efficiency_percent || 85, 
            rand(80, 95), 
            0.02
        ).toFixed(2)),
        downtime_minutes_today: state.downtime_minutes_today !== undefined
            ? (Math.random() < 0.02 ? state.downtime_minutes_today + randInt(1, 5) : state.downtime_minutes_today)
            : 0,
        cycles_completed: payload.machine_sensors.cycles_completed_today,
        quality_index_average: Number((Object.values(payload.tanks)
            .reduce((sum, t) => sum + t.quality_index_percent, 0) / 
            Object.keys(payload.tanks).length).toFixed(2))
    };
    
    // Store production stats
    state.efficiency_percent = payload.production_stats.efficiency_percent;
    state.downtime_minutes_today = payload.production_stats.downtime_minutes_today;
    
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
        machineSensors: {},
        machine_next_service_days: randInt(30, 90),
        filter_replacement_due_days: randInt(15, 60),
        calibration_due_days: randInt(60, 180),
        efficiency_percent: rand(82, 92),
        downtime_minutes_today: 0,
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
        intervalMs: state.intervalMs,
        note: "Realistic 24-hour simulation with time-based consumption patterns"
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

