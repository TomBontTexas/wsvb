// Calculation core ported from VehicleData.cs / Trait.cs / BoutiqueService.cs / Enumerations.cs
// Property names are camelCase versions of the original C# properties.
// Where the original used a C# get-only property, this file uses a JS getter of the same name
// so call sites read identically (vehicle.cpSpent, not vehicle.cpSpent()).

const ENUMS = {
  Compartmentalization: ["Standard", "Reinforced", "Total", "Fortress"],
  FrameStrength: ["Standard", "SuperLight", "Light", "Heavy", "SuperHeavy"],
  EnvironmentalInterface: ["None", "FTL", "Ground", "GroundExclusive", "Water", "WaterExclusive", "Atmospheric", "AtmosphericExclusive", "Orbital", "Interplanetary"],
  InterfaceOptions: ["None", "Aquaform", "TailLander", "Voidbound"],
  TransportTypes: ["DayTrip", "Excursion", "Voyage"],
  PassengerClasses: ["Cryo", "Evac", "Steerage", "Coach", "First"],
  CrewClasses: ["Civilian", "Ranger", "Military"],
  CapitalWeaponSystemTypes: ["None", "AntiMatterBeam", "BRRRPGun", "DarkMatterBlaster", "FusionBlaster", "FusionDisruptor", "GravitonEmitter", "IonGun", "PlasmaPulse", "PulsarRay", "QuantumBarrage", "SingularityFlare", "TachyonCannon"],
  StandardWeaponSystemTypes: ["None", "AntiMatterBeam", "DarkMatterBlaster", "FusionBlaster", "FusionDisruptor", "GravitonEmitter", "IonGun", "PlasmaPulse", "PulsarRay", "QuantumBarrage", "SingularityFlare", "TachyonCannon"],
  MissileWeaponSystemTypes: ["None", "Missile"],
  SlugThrowerWeaponSystemTypes: ["None", "Cannon", "Artillary", "Railgun"],
};

const PASSENGER_VOLUME_TABLE = {
  DayTrip: { Cryo: 0, Evac: 8, Steerage: 4, Coach: 2, First: 1 },
  Excursion: { Cryo: 0, Evac: 1, Steerage: 0.4, Coach: 0.2, First: 0.1 },
  Voyage: { Cryo: 2, Evac: 0.4, Steerage: 0.2, Coach: 0.1, First: 0.05 },
};

function getPassPerTon(transportType, passengerClass) {
  return PASSENGER_VOLUME_TABLE[transportType][passengerClass];
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) - this
// app is also served over plain HTTP on a LAN, so generate IDs without it.
function generateId() {
  return "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Mirrors C# ToString("N0")/("N1")/("N2") - thousands separator + fixed decimals
function fmtN(value, decimals) {
  return Number(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtN0(value) { return fmtN(value, 0); }
function fmtN1(value) { return fmtN(value, 1); }
function fmtN2(value) { return fmtN(value, 2); }

// "FusionBlaster" -> "Fusion Blaster", "BRRRPGun" -> "BRRRP Gun" (keeps acronym runs
// intact). Enum values like weapon system types are stored PascalCase with no spaces.
function splitCamelCase(str) {
  return String(str ?? "")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z\d])([A-Z])/g, "$1 $2");
}

// ---------------------------------------------------------------------------
// Trait
// ---------------------------------------------------------------------------
class Trait {
  constructor(data = {}) {
    this.traitName = data.traitName ?? "";
    this.baseCP = data.baseCP ?? "";
    this.maxLevel = data.maxLevel ?? 0;
    this.prerequisite = data.prerequisite ?? "";
    this.note = data.note ?? "";
    this.selectedLevel = data.selectedLevel ?? 1;
  }

  static getMinMaxCost(input) {
    if (!input) return 0;

    let match = /Max CP Cost\s+(\d+)/.exec(input);
    if (match) {
      return parseInt(match[1], 10);
    }

    match = /\bMin\s*CP\s*Cost\b\s*([-+]?\d+)/i.exec(input);
    if (match) {
      const num = match[1].replace(/[–−]/g, "-");
      const minCp = parseInt(num, 10);
      if (!Number.isNaN(minCp)) return minCp;
    }

    return 0;
  }

  costTrait(vehicle) {
    const tier = vehicle.tier;
    const level = this.selectedLevel;

    if (this.baseCP === "Tier") {
      const minMaxRange = Trait.getMinMaxCost(this.note);
      let returnValue = tier * level;
      if (minMaxRange > 0) {
        returnValue = Math.min(minMaxRange, tier * level);
      } else if (minMaxRange < 0) {
        returnValue = Math.max(minMaxRange, tier * level);
      }
      return returnValue;
    }

    if (this.baseCP === "Tier x 2") return tier * 2 * level;
    if (this.baseCP === "Tier x 5") return tier * 5 * level;

    if (this.baseCP === "-Tier") {
      const minMaxRange = Trait.getMinMaxCost(this.note);
      let returnValue = -(tier * level);
      if (minMaxRange > 0) {
        returnValue = Math.min(minMaxRange, -tier * level);
      } else if (minMaxRange < 0) {
        returnValue = Math.max(minMaxRange, -tier * level);
      }
      return returnValue;
    }

    if (this.baseCP === "-Tier x 2") return -(tier * 2 * level);
    if (this.baseCP === "-Tier x 5") return -(tier * 5 * level);

    const parsed = parseInt(this.baseCP, 10);
    if (!Number.isNaN(parsed) && String(parsed) === String(this.baseCP).trim()) {
      return parsed * level;
    }

    return 0;
  }
}

// ---------------------------------------------------------------------------
// BoutiqueService
// ---------------------------------------------------------------------------
class BoutiqueService {
  constructor(data = {}) {
    this.boutiqueServiceName = data.boutiqueServiceName ?? "";
    this.baseCP = data.baseCP ?? "";
    this.note = data.note ?? "";
  }

  costBoutiqueService(vehicle) {
    return vehicle.tier;
  }
}

// ---------------------------------------------------------------------------
// VehicleData
// ---------------------------------------------------------------------------
const FEATURE_KEYS = [
  "Control", "EW", "Gunner", "Nav", "Research", "Security", "Sensors",
  "Armor", "BC", "CH", "DC", "GH", "HS", "Hpress", "OD", "QT", "RP", "Stealth", "Thrust", "Warp",
];

class VehicleData {
  constructor() {
    this.dirty = false;

    this.vehicleName = "";
    this.vehicleClass = "Class Name";
    this.vehicleMission = "Vehicle Mission";
    this.vehicleDescription = "";
    this.tier = 4;
    this.tl = 7;

    this.fileName = "";
    this.id = generateId();

    this.selectedTraits = [];
    this.selectedBoutiqueServices = [];

    // Operations - AI Levels
    this.aiControlLevel = 0; this.aiEWLevel = 0; this.aiGunnerLevel = 0; this.aiNavLevel = 0;
    this.aiResearchLevel = 0; this.aiSecurityLevel = 0; this.aiSensorsLevel = 0;
    // Operations - Crew Levels
    this.crewControlLevel = 0; this.crewEWLevel = 0; this.crewGunnerLevel = 0; this.crewNavLevel = 0;
    this.crewResearchLevel = 0; this.crewSecurityLevel = 0; this.crewSensorsLevel = 0;

    // Platform - Levels
    this.levelArmor = 0; this.levelBC = 0; this.levelCH = 0; this.levelDC = 0; this.levelGH = 0;
    this.levelHS = 0; this.levelHpress = 0; this.levelOD = 0; this.levelQT = 0; this.levelRP = 0;
    this.levelStealth = 0; this.levelThrust = 0; this.levelWarp = 0;
    // Platform - Bonuses
    this.bonusArmor = 0; this.bonusBC = 0; this.bonusCH = 0; this.bonusDC = 0; this.bonusGH = 0;
    this.bonusHS = 0; this.bonusHpress = 0; this.bonusOD = 0; this.bonusQT = 0; this.bonusRP = 0;
    this.bonusStealth = 0; this.bonusThrust = 0; this.bonusWarp = 0;

    // Weapons
    this.capitalMk = 0; this.standardMk = 0; this.missileMk = 0; this.slugMk = 0;
    this.capitalWeaponSystemType = "None";
    this.standardWeaponSystemType = "None";
    this.missileWeaponSystemType = "None";
    this.slugThrowerWeaponSystemType = "None";

    // Ship configuration
    this.crewClass = "Civilian";
    this.compartmentalizationSelected = "Standard";
    this.frameStrengthSelected = "Standard";
    this.environmentalInterfacePrimary = "FTL";
    this.environmentalInterfaceSecondary = "None";
    this.environmentalInterfaceTertiary = "None";
    this.vtolAtol = false;
    this.includesLifeSupport = false;
    this.interfaceOption = "None";
    this.transportType = "Voyage";
    this.passengerClass = "Coach";

    this.actualMaxTons = 0;
  }

  getTraitSelectedLevel(traitNameOfInterest) {
    for (const trait of this.selectedTraits) {
      if (trait.traitName === traitNameOfInterest) {
        if (trait.selectedLevel > 0) return trait.selectedLevel;
      }
    }
    return 0;
  }

  // Mk = Level + Bonus (or AI + Crew for operations)
  get mkControl() { return this.aiControlLevel + this.crewControlLevel; }
  get mkEW() { return this.aiEWLevel + this.crewEWLevel; }
  get mkGunner() { return this.aiGunnerLevel + this.crewGunnerLevel; }
  get mkNav() { return this.aiNavLevel + this.crewNavLevel; }
  get mkResearch() { return this.aiResearchLevel + this.crewResearchLevel; }
  get mkSecurity() { return this.aiSecurityLevel + this.crewSecurityLevel; }
  get mkSensors() { return this.aiSensorsLevel + this.crewSensorsLevel; }

  get mkArmor() { return this.levelArmor + this.bonusArmor; }
  get mkBC() { return this.levelBC + this.bonusBC; }
  get mkCH() { return this.levelCH + this.bonusCH; }
  get mkDC() { return this.levelDC + this.bonusDC; }
  get mkGH() { return this.levelGH + this.bonusGH; }
  get mkHS() { return this.levelHS + this.bonusHS; }
  get mkHpress() { return this.levelHpress + this.bonusHpress; }
  get mkOD() { return this.levelOD + this.bonusOD; }
  get mkQT() { return this.levelQT + this.bonusQT; }
  get mkRP() { return this.levelRP + this.bonusRP; }
  get mkStealth() { return this.levelStealth + this.bonusStealth; }
  get mkThrust() { return this.levelThrust + this.bonusThrust; }
  get mkWarp() { return this.levelWarp + this.bonusWarp; }

  static calculateFeatureCPCost(level) {
    if (level <= 0) return 0;
    return (level * (level + 1)) / 2;
  }

  get cpCostControl() { return VehicleData.calculateFeatureCPCost(this.aiControlLevel); }
  get cpCostEW() { return VehicleData.calculateFeatureCPCost(this.aiEWLevel); }
  get cpCostGunner() { return VehicleData.calculateFeatureCPCost(this.aiGunnerLevel); }
  get cpCostNav() { return VehicleData.calculateFeatureCPCost(this.aiNavLevel); }
  get cpCostResearch() { return VehicleData.calculateFeatureCPCost(this.aiResearchLevel); }
  get cpCostSecurity() { return VehicleData.calculateFeatureCPCost(this.aiSecurityLevel); }
  get cpCostSensors() { return VehicleData.calculateFeatureCPCost(this.aiSensorsLevel); }
  get cpCostArmor() { return VehicleData.calculateFeatureCPCost(this.levelArmor); }
  get cpCostBC() { return VehicleData.calculateFeatureCPCost(this.levelBC); }
  get cpCostCH() { return VehicleData.calculateFeatureCPCost(this.levelCH); }
  get cpCostDC() { return VehicleData.calculateFeatureCPCost(this.levelDC); }
  get cpCostGH() { return VehicleData.calculateFeatureCPCost(this.levelGH); }
  get cpCostHS() { return VehicleData.calculateFeatureCPCost(this.levelHS); }
  get cpCostHpress() { return VehicleData.calculateFeatureCPCost(this.levelHpress); }
  get cpCostOD() { return VehicleData.calculateFeatureCPCost(this.levelOD); }
  get cpCostQT() { return VehicleData.calculateFeatureCPCost(this.levelQT); }
  get cpCostRP() { return VehicleData.calculateFeatureCPCost(this.levelRP); }
  get cpCostStealth() { return VehicleData.calculateFeatureCPCost(this.levelStealth); }
  get cpCostThrust() { return VehicleData.calculateFeatureCPCost(this.levelThrust); }
  get cpCostWarp() { return VehicleData.calculateFeatureCPCost(this.levelWarp); }

  get cpCostTotalFeatures() {
    return this.cpCostControl + this.cpCostEW + this.cpCostGunner + this.cpCostNav + this.cpCostResearch +
      this.cpCostSecurity + this.cpCostSensors + this.cpCostArmor + this.cpCostBC + this.cpCostCH +
      this.cpCostDC + this.cpCostGH + this.cpCostHS + this.cpCostHpress + this.cpCostOD + this.cpCostQT +
      this.cpCostRP + this.cpCostStealth + this.cpCostThrust + this.cpCostWarp;
  }

  get cpCostEnvironmental() { return this.cpCostSecondaryInterface + this.cpCostTertiaryInterface; }

  get cpCostWeaponCapital() { return this.capitalMk; }
  get cpCostWeaponStandard() { return this.standardMk; }
  get cpCostWeaponMissiles() { return this.missileMk; }
  get cpCostWeaponSlug() { return this.slugMk; }

  get cpCostCompartmentalization() {
    switch (this.compartmentalizationSelected) {
      case "Standard": return 0;
      case "Reinforced": return this.tier;
      case "Total": return this.tier * 2;
      case "Fortress": return this.tier * 3;
      default: return 0;
    }
  }

  get cpCostFrameStrength() {
    switch (this.frameStrengthSelected) {
      case "SuperLight": return -(this.tier * 2);
      case "Light": return -this.tier;
      case "Standard": return 0;
      case "Heavy": return this.tier;
      case "SuperHeavy": return this.tier * 2;
      default: return 0;
    }
  }

  get cpCostSecondaryInterface() {
    return this.environmentalInterfaceSecondary !== "None" ? this.tier : 0;
  }

  get cpCostTertiaryInterface() {
    return this.environmentalInterfaceTertiary !== "None" ? this.tier : 0;
  }

  get cpCostInterfaceOptions() {
    switch (this.interfaceOption) {
      case "None": return 0;
      case "Aquaform": return 0;
      default: return -this.tier;
    }
  }

  get cpMax() {
    return this.tl === 0 ? this.tier : this.tl * this.tier * 3;
  }

  sumSelectedTraitsBaseCP() {
    return this.selectedTraits.reduce((sum, t) => sum + t.costTrait(this), 0);
  }

  sumSelectedBoutiqueServicesBaseCP() {
    return this.selectedBoutiqueServices.reduce((sum, b) => sum + b.costBoutiqueService(this), 0);
  }

  get cpSpent() {
    return this.cpCostTotalFeatures +
      this.cpCostWeaponCapital + this.cpCostWeaponStandard + this.cpCostWeaponMissiles + this.cpCostWeaponSlug +
      this.sumSelectedTraitsBaseCP() + this.sumSelectedBoutiqueServicesBaseCP() +
      this.cpCostCompartmentalization + this.cpCostFrameStrength +
      this.cpCostSecondaryInterface + this.cpCostTertiaryInterface +
      this.cpCostInterfaceOptions;
  }

  get unspentCP() { return this.cpMax - this.cpSpent; }

  // Crew
  get commandCrew() { return this.tier; }

  get activeCrew() {
    let minCrew = this.buildTons / 500.0;
    if (this.crewClass === "Ranger") minCrew *= 2;
    else if (this.crewClass === "Military") minCrew *= 3;

    minCrew *= 7.0 / Math.max(this.tl, 1);

    const opsStewardsMedics = minCrew / 100.0;
    return Math.round(minCrew + opsStewardsMedics);
  }

  get serviceCrew() {
    const putStewardsMedics = this.totalPassengers / 100;
    const cutHandlers = (this.cpCostCH / this.cpMax) * this.buildTons / 1000;
    return Math.round(putStewardsMedics + cutHandlers);
  }

  get totalCrew() { return this.commandCrew + this.activeCrew + this.serviceCrew; }

  // Calculated statistics
  get vehicleTitle() {
    if (this.vehicleName !== "") {
      return `${this.vehicleName} ${this.vehicleClass}-Class Tier-${this.tier} ${this.vehicleMission} (TL${this.tl})`;
    }
    return `${this.vehicleClass}-Class Tier-${this.tier} ${this.vehicleMission} (TL${this.tl})`;
  }

  // Same content as vehicleTitle, split across the natural break for
  // two-line display (e.g. the sidebar vehicle list).
  get vehicleTitleLine1() {
    const namePrefix = this.vehicleName !== "" ? `${this.vehicleName} ` : "";
    return `${namePrefix}${this.vehicleClass}-Class Tier-${this.tier}`;
  }
  get vehicleTitleLine2() {
    return `${this.vehicleMission} (TL${this.tl})`;
  }

  get tonsRecommended() {
    switch (this.tier) {
      case 1: return 25;
      case 2: return 100;
      case 3: return 500;
      case 4: return 2000;
      case 5: return 10000;
      case 6: return 40000;
      case 7: return 150000;
      case 8: return 600000;
      case 9: return 2500000;
      case 10: return 10000000;
      default: return -99;
    }
  }

  get buildTons() {
    const cpRatio = this.cpSpent / this.cpMax;
    return cpRatio * this.actualMaxTons;
  }

  getFeatureTons(cpFeatureCost) {
    return (cpFeatureCost / this.cpMax) * this.buildTons;
  }

  getFeatureTonsMax(cpFeatureCost) {
    return this.getFeatureTons(cpFeatureCost);
  }

  get totalMonero() {
    let frameModifier = 1.0;
    switch (this.frameStrengthSelected) {
      case "SuperLight": frameModifier = 0.25; break;
      case "Light": frameModifier = 0.5; break;
      case "Standard": frameModifier = 1; break;
      case "Heavy": frameModifier = 2; break;
      case "SuperHeavy": frameModifier = 4; break;
      default: frameModifier = 1; break;
    }

    return this.cpSpent *
      Math.pow(2, this.tier) *
      Math.max(1, this.tl) / 7 *
      frameModifier / 10 *
      this.actualMaxTons / this.tonsRecommended;
  }

  get totalPassengers() {
    const passPerTon = getPassPerTon(this.transportType, this.passengerClass);
    const selectedLevel = this.getTraitSelectedLevel("We'll Leave the Light On");
    let mult = 1 + selectedLevel * 0.1;

    if (this.mkBC < 1 || this.mkBC >= this.tier) mult = 1;

    let tempPassengers;
    if (this.includesLifeSupport) {
      tempPassengers = this.getFeatureTonsMax(this.cpCostBC) * (this.tl / 7.0) * passPerTon * mult;
    } else {
      tempPassengers = this.getFeatureTonsMax(this.cpCostBC) * passPerTon * mult;
    }

    return Math.round(tempPassengers);
  }

  get hangarSpaceTons() {
    return Math.round(this.getFeatureTonsMax(this.cpCostHS));
  }

  get totalCargoUnits() {
    let tempCargoUnits = this.getFeatureTonsMax(this.cpCostCH);
    let mult = 1;

    if (this.getTraitSelectedLevel("It'll Fit!") !== 0) {
      mult = 1 + this.getTraitSelectedLevel("It'll Fit!") * 0.05;
    } else if (this.getTraitSelectedLevel("Who Put this Pole Here?") !== 0) {
      mult = 1 - 0.25 * this.getTraitSelectedLevel("Who Put this Pole Here?");
    }

    if (this.mkCH > 0 && this.mkCH <= this.tier) {
      tempCargoUnits *= mult;
    }

    return Math.round(tempCargoUnits);
  }

  get ghp() { return Math.round(this.tier * this.accelG); }

  get sb() {
    let mkAdder = 0;
    if (this.getTraitSelectedLevel("Superior System Range-Sensors") !== 0) {
      mkAdder = this.getTraitSelectedLevel("Superior System Range-Sensors");
    } else if (this.getTraitSelectedLevel("Inferior System Range-Sensors") !== 0) {
      mkAdder = -this.getTraitSelectedLevel("Inferior System Range-Sensors");
    }
    return this.tier + (this.mkSensors + mkAdder);
  }

  get od() {
    const isVoyager = this.transportType === "Voyage";
    const isEvac = this.passengerClass === "Evac";
    let returnValue = isVoyager ? this.mkOD * 100.0 : this.mkOD * 10.0;
    returnValue = Math.max(1, returnValue);

    let mult = 1;
    switch (this.getTraitSelectedLevel("Trickle Charge")) {
      case 1: mult = 1.25; break;
      case 2: mult = 1.5; break;
      case 3: mult = 2.0; break;
      default:
        switch (this.getTraitSelectedLevel("Power Hog")) {
          case 1: mult = 0.5; break;
          case 2: mult = 0.25; break;
          case 3: mult = 0.125; break;
          default: mult = 1.0; break;
        }
        break;
    }

    returnValue *= mult;
    if (isEvac) returnValue *= 0.5;
    return returnValue;
  }

  get dr() {
    switch (this.compartmentalizationSelected) {
      case "Standard": return this.mkArmor * this.tier;
      case "Reinforced": return this.mkArmor * this.tier * 2;
      case "Total": return this.mkArmor * this.tier * 3;
      case "Fortress": return this.mkArmor * this.tier * 4;
      default: return 0;
    }
  }

  get hp() {
    const cpCostFeaturesWeapons = this.cpCostTotalFeatures +
      this.cpCostWeaponCapital + this.cpCostWeaponStandard + this.cpCostWeaponMissiles + this.cpCostWeaponSlug;
    let rawHP = 0;

    switch (this.frameStrengthSelected) {
      case "SuperLight": rawHP = cpCostFeaturesWeapons * this.tier * 0.25; break;
      case "Light": rawHP = cpCostFeaturesWeapons * this.tier * 0.5; break;
      case "Standard": rawHP = cpCostFeaturesWeapons * this.tier; break;
      case "Heavy": rawHP = cpCostFeaturesWeapons * this.tier * 2; break;
      case "SuperHeavy": rawHP = cpCostFeaturesWeapons * this.tier * 4; break;
      default: rawHP = 0; break;
    }

    return Math.ceil(rawHP);
  }

  get hpRepaired() {
    const base = (this.tier + this.mkDC) * 3;
    return this.getTraitSelectedLevel("It's Not Really Broken") === 0 ? base : base * 2;
  }

  get qtRange() {
    let mkAdder = 0;
    if (this.getTraitSelectedLevel("Superior System Range-QT") !== 0) {
      mkAdder = this.getTraitSelectedLevel("Superior System Range-QT");
    } else if (this.getTraitSelectedLevel("Inferior System Range-QT") !== 0) {
      mkAdder = -this.getTraitSelectedLevel("Inferior System Range-QT");
    }
    return this.tier * (mkAdder + this.mkQT) * 2;
  }

  get deflect() { return this.mkArmor + this.mkControl; }

  // Speeds
  static speedMultFromTrait(vehicle, boostTraitName, slowTraitName) {
    let mult = 1;
    if (vehicle.getTraitSelectedLevel(boostTraitName) !== 0) {
      switch (vehicle.getTraitSelectedLevel(boostTraitName)) {
        case 1: mult = 1.125; break;
        case 2: mult = 1.25; break;
        case 3: mult = 1.5; break;
        default: mult = 1.0; break;
      }
    } else if (vehicle.getTraitSelectedLevel(slowTraitName) !== 0) {
      mult = Math.pow(0.5, vehicle.getTraitSelectedLevel(slowTraitName));
    }
    return mult;
  }

  get warpSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Warp", "Turtle Speed-Warp");
    return this.mkWarp * mult;
  }

  get accelG() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Space", "Turtle Speed-Space");
    if (this.hasFTLInterface() || this.hasInterplanetaryInterface() || this.hasOrbitalInterface()) {
      return this.mkThrust * mult;
    }
    return 0;
  }

  get aSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Atmospheric", "Turtle Speed-Atmospheric");
    if (this.interfaceOption === "Voidbound") return 0;
    if (this.hasFTLInterface() || this.hasInterplanetaryInterface() || this.hasOrbitalInterface() || this.hasAtmosphericInterface()) {
      return this.mkThrust * 300 * mult;
    }
    return 0;
  }

  get gSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Ground/Off-Road", "Turtle Speed-Ground/Off-Road");
    if (this.hasGroundInterface()) return this.mkThrust * 100 * mult;
    if (this.vtolAtol) return 0;

    if (this.hasFTLInterface() && this.interfaceOption === "None") return Math.min(150, this.aSpeed / 2);
    if (this.hasInterplanetaryInterface() && this.interfaceOption === "None") return Math.min(150, this.aSpeed / 2);
    if (this.hasOrbitalInterface() && this.interfaceOption === "None") return Math.min(150, this.aSpeed / 2);
    if (this.hasAtmosphericInterface()) return Math.min(150, this.aSpeed / 2);

    return 0;
  }

  get oSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Ground/Off-Road", "Turtle Speed-Ground/Off-Road");
    if (this.hasGroundInterface()) return this.mkThrust * 50 * mult;
    return 0;
  }

  get wSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Water/Underwater", "Turtle Speed-Water/Underwater");
    if (this.hasWaterInterface()) {
      return this.interfaceOption === "Aquaform" ? this.mkThrust * 25 * mult : this.mkThrust * 50 * mult;
    }
    return 0;
  }

  get uSpeed() {
    const mult = VehicleData.speedMultFromTrait(this, "Scalded Banshee-Water/Underwater", "Turtle Speed-Water/Underwater");
    if (this.hasWaterInterface()) {
      return this.interfaceOption === "Aquaform" ? this.mkThrust * 50 * mult : this.mkThrust * 25 * mult;
    }
    return 0;
  }

  get atms() {
    return this.hasWaterInterface() ? Math.pow(2, this.mkHpress + 1) * 2 : Math.pow(2, this.mkHpress + 1);
  }

  hasFTLInterface() {
    return this.environmentalInterfacePrimary === "FTL" || this.environmentalInterfaceSecondary === "FTL" || this.environmentalInterfaceTertiary === "FTL";
  }
  hasInterplanetaryInterface() {
    return this.environmentalInterfacePrimary === "Interplanetary" || this.environmentalInterfaceSecondary === "Interplanetary" || this.environmentalInterfaceTertiary === "Interplanetary";
  }
  hasOrbitalInterface() {
    return this.environmentalInterfacePrimary === "Orbital" || this.environmentalInterfaceSecondary === "Orbital" || this.environmentalInterfaceTertiary === "Orbital";
  }
  hasAtmosphericInterface() {
    return ["Atmospheric", "AtmosphericExclusive"].includes(this.environmentalInterfacePrimary) ||
      ["Atmospheric", "AtmosphericExclusive"].includes(this.environmentalInterfaceSecondary) ||
      ["Atmospheric", "AtmosphericExclusive"].includes(this.environmentalInterfaceTertiary);
  }
  hasGroundInterface() {
    return ["Ground", "GroundExclusive"].includes(this.environmentalInterfacePrimary) ||
      ["Ground", "GroundExclusive"].includes(this.environmentalInterfaceSecondary) ||
      ["Ground", "GroundExclusive"].includes(this.environmentalInterfaceTertiary);
  }
  hasWaterInterface() {
    return ["Water", "WaterExclusive"].includes(this.environmentalInterfacePrimary) ||
      ["Water", "WaterExclusive"].includes(this.environmentalInterfaceSecondary) ||
      ["Water", "WaterExclusive"].includes(this.environmentalInterfaceTertiary);
  }

  // Weapons
  get capitalAttackBonus() {
    if (this.capitalMk === 0 || this.capitalWeaponSystemType === "None") return 0;
    return this.capitalMk + this.mkGunner + this.tier;
  }
  get standardAttackBonus() {
    if (this.standardMk === 0 || this.standardWeaponSystemType === "None") return 0;
    return this.standardMk + this.mkGunner + this.tier;
  }
  get missileAttackBonus() {
    if (this.missileMk === 0 || this.missileWeaponSystemType === "None") return 0;
    return this.missileMk + this.mkGunner + this.tier;
  }
  get slugAttackBonus() {
    if (this.slugMk === 0 || this.slugThrowerWeaponSystemType === "None") return 0;
    return this.slugMk + this.mkGunner + this.tier;
  }

  get capitalRange() {
    let mult = 1;
    let mkAdder = 0;
    if (this.getTraitSelectedLevel("Sharp Fangs-Capital") !== 0) mult = 2;
    else if (this.getTraitSelectedLevel("Dull Teeth-Capital") !== 0) mult = 0.5;

    if (this.getTraitSelectedLevel("Superior System Range-Capital") !== 0) mkAdder = this.getTraitSelectedLevel("Superior System Range-Capital");
    else if (this.getTraitSelectedLevel("Inferior System Range-Capital") !== 0) mkAdder = -this.getTraitSelectedLevel("Inferior System Range-Capital");

    const totalMk = this.capitalMk + mkAdder;
    if (this.capitalMk === 0 || this.capitalWeaponSystemType === "None") return 0;

    switch (this.capitalWeaponSystemType) {
      case "None": return 0;
      case "AntiMatterBeam": return Math.ceil(totalMk * 4.0 / 2.0 * mult);
      case "BRRRPGun": return this.tl * 3;
      case "DarkMatterBlaster": return Math.ceil(totalMk * 4.0 / 2.0 * mult);
      case "FusionBlaster": return Math.ceil(totalMk * 4 * mult);
      case "FusionDisruptor": return Math.ceil(totalMk * mult);
      case "GravitonEmitter": return Math.ceil((totalMk + 1) * mult);
      case "IonGun": return Math.ceil(totalMk * mult);
      case "PlasmaPulse": return Math.ceil(totalMk * 4 * mult);
      case "PulsarRay": return Math.ceil(totalMk * 4 * mult);
      case "QuantumBarrage": return Math.ceil(totalMk * 4 * mult);
      case "SingularityFlare": return Math.ceil((totalMk + 1) * mult);
      case "TachyonCannon": return Math.ceil(totalMk * mult);
      default: return 1;
    }
  }

  get standardRange() {
    let mult = 1;
    let mkAdder = 0;
    if (this.getTraitSelectedLevel("Sharp Fangs-Standard") !== 0) mult = 2;
    else if (this.getTraitSelectedLevel("Dull Teeth-Standard") !== 0) mult = 0.5;

    if (this.getTraitSelectedLevel("Superior System Range-Standard") !== 0) mkAdder = this.getTraitSelectedLevel("Superior System Range-Standard");
    else if (this.getTraitSelectedLevel("Inferior System Range-Standard") !== 0) mkAdder = -this.getTraitSelectedLevel("Inferior System Range-Standard");

    const totalMk = this.standardMk + mkAdder;
    if (this.standardMk === 0 || this.standardWeaponSystemType === "None") return 0;

    switch (this.standardWeaponSystemType) {
      case "None": return 0;
      case "AntiMatterBeam": return Math.ceil(totalMk * 3.0 / 2.0 * mult);
      case "DarkMatterBlaster": return Math.ceil(totalMk * 3.0 / 2.0 * mult);
      case "FusionBlaster": return Math.ceil(totalMk * 3 * mult);
      case "FusionDisruptor": return Math.ceil(totalMk * mult);
      case "GravitonEmitter": return Math.ceil((totalMk + 1) * mult);
      case "IonGun": return Math.ceil(totalMk * mult);
      case "PlasmaPulse": return Math.ceil(totalMk * 3 * mult);
      case "PulsarRay": return Math.ceil(totalMk * 3 * mult);
      case "QuantumBarrage": return Math.ceil(totalMk * 3 * mult);
      case "SingularityFlare": return Math.ceil((totalMk + 1) * mult);
      case "TachyonCannon": return Math.ceil(totalMk * mult);
      default: return 1;
    }
  }

  get missileRange() {
    let mult = 1;
    if (this.getTraitSelectedLevel("Sharp Fangs-Missiles") !== 0) mult = 2;
    else if (this.getTraitSelectedLevel("Dull Teeth-Missiles") !== 0) mult = 0.5;

    if (this.missileMk === 0 || this.missileWeaponSystemType === "None") return 0;
    const useTL = Math.max(this.tl, 1);
    return Math.ceil(useTL * mult);
  }

  get slugRange() {
    let mult = 1;
    if (this.getTraitSelectedLevel("Sharp Fangs-Slug Thrower") !== 0) mult = 2;
    else if (this.getTraitSelectedLevel("Dull Teeth-Slug Thrower") !== 0) mult = 0.5;

    const useTL = Math.max(this.tl, 1);
    if (this.slugMk === 0 || this.slugThrowerWeaponSystemType === "None") return 0;
    return Math.ceil(useTL * 2 * mult);
  }

  get capitalDamage() {
    const useTL = Math.max(this.tl, 1);
    if (this.capitalMk === 0 || this.capitalWeaponSystemType === "None") return 0;
    return Math.trunc(useTL * (this.capitalMk + this.mkRP) * (this.capitalMk + this.mkRP) * this.actualMaxTons / this.tonsRecommended);
  }

  get standardDamage() {
    const useTL = Math.max(this.tl, 1);
    if (this.standardMk === 0 || this.standardWeaponSystemType === "None") return 0;
    return Math.trunc(Math.trunc(useTL * (this.standardMk + this.mkRP) * (this.standardMk + this.mkRP) * this.actualMaxTons / this.tonsRecommended) / 2);
  }

  get missileDamage() {
    const useTL = Math.max(this.tl, 1);
    if (this.missileMk === 0 || this.missileWeaponSystemType === "None") return 0;
    return Math.trunc(useTL * this.missileMk * this.missileMk * this.actualMaxTons / this.tonsRecommended);
  }

  get slugDamage() {
    const useTL = Math.max(this.tl, 1);
    if (this.slugMk === 0 || this.slugThrowerWeaponSystemType === "None") return 0;
    return Math.trunc(useTL * this.slugMk * this.slugMk * this.actualMaxTons / this.tonsRecommended);
  }

  // ---------------------------------------------------------------------------
  // Statistics block (HTML equivalent of the original RTF export)
  // ---------------------------------------------------------------------------
  get statisticsHTML() {
    const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = [];

    let crewLine;
    if (this.getTraitSelectedLevel("Extreme Automation") > 0) {
      crewLine = `Crew: Total ${this.totalCrew} / ${Math.ceil(Math.sqrt(this.totalCrew))}. `;
    } else {
      crewLine = `Crew: Total ${this.totalCrew}. `;
    }
    const crewParts = [`Command ${this.commandCrew}`];
    if (this.activeCrew > 0) crewParts.push(`Active ${this.activeCrew}`);
    if (this.serviceCrew > 0) crewParts.push(`Service ${this.serviceCrew}`);
    lines.push(crewLine + crewParts.join(", ") + ".");

    const opParts = [];
    if (this.mkControl > 0) opParts.push(`Control-${this.mkControl}`);
    if (this.mkEW > 0) opParts.push(`EW-${this.mkEW}`);
    if (this.mkGunner > 0) opParts.push(`Gunner-${this.mkGunner}`);
    if (this.mkNav > 0) opParts.push(`Nav-${this.mkNav}`);
    if (this.mkResearch > 0) opParts.push(`Research-${this.mkResearch}`);
    if (this.mkSecurity > 0) opParts.push(`Security-${this.mkSecurity}`);
    if (this.mkSensors > 0) opParts.push(`Sensors-${this.mkSensors}`);
    lines.push("Operations: " + opParts.join(", ") + ".");

    const platParts = [];
    if (this.mkArmor > 0) platParts.push(`Armor-${this.mkArmor}`);
    if (this.mkBC > 0) platParts.push(`BC-${this.mkBC}`);
    if (this.mkCH > 0) platParts.push(`CH-${this.mkCH}`);
    if (this.mkDC > 0) platParts.push(`DC-${this.mkDC}`);
    if (this.mkGH > 0) platParts.push(`GH-${this.mkGH}`);
    if (this.mkHS > 0) platParts.push(`HS-${this.mkHS}`);
    if (this.mkHpress > 0) platParts.push(`Hpress-${this.mkHpress}`);
    if (this.mkOD > 0) platParts.push(`OD-${this.mkOD}`);
    if (this.mkQT > 0) platParts.push(`QT-${this.mkQT}`);
    if (this.mkRP > 0) platParts.push(`RP-${this.mkRP}`);
    if (this.mkStealth > 0) platParts.push(`Stealth-${this.mkStealth}`);
    if (this.mkThrust > 0) platParts.push(`Thrust-${this.mkThrust}`);
    if (this.mkWarp > 0) platParts.push(`Warp-${this.mkWarp}`);
    lines.push("Platform: " + platParts.join(", ") + ".");

    const structParts = [];
    if (this.frameStrengthSelected !== "Standard") structParts.push(`${this.frameStrengthSelected} Frame (${this.cpCostFrameStrength})`);
    if (this.compartmentalizationSelected !== "Standard") structParts.push(`${this.compartmentalizationSelected} Compartmentalization (${this.cpCostCompartmentalization})`);
    if (structParts.length > 0) lines.push("Structure: " + structParts.join(", ") + ".");

    if (this.selectedTraits.length > 0) {
      const traitParts = this.selectedTraits.map((t) =>
        t.selectedLevel > 1
          ? `${t.traitName}-${t.selectedLevel} (${t.costTrait(this)})`
          : `${t.traitName} (${t.costTrait(this)})`
      );
      lines.push("Traits: " + traitParts.join(", ") + ".");
    }

    if (this.selectedBoutiqueServices.length > 0) {
      const bsParts = this.selectedBoutiqueServices.map((b) => `${b.boutiqueServiceName} (${b.costBoutiqueService(this)})`);
      lines.push("Boutique Services: " + bsParts.join(", ") + ".");
    }

    const combatParts = [
      `DR ${this.dr}`,
      `HP ${this.hp} (${Math.ceil(this.hp / 50)}/${Math.ceil(this.hp / 100)})`,
      `Deflect ${this.deflect}`,
      `Rx ${Math.floor(this.tier / 2.0)}`,
    ];
    lines.push("Combat: " + combatParts.join(", ") + ".");

    // Weapons table
    const weaponRows = [];
    if (this.capitalMk > 0 && this.capitalWeaponSystemType !== "None")
      weaponRows.push([`Capital: ${splitCamelCase(this.capitalWeaponSystemType)}`, this.capitalMk, this.capitalAttackBonus, this.capitalRange, this.capitalDamage]);
    if (this.standardMk > 0 && this.standardWeaponSystemType !== "None")
      weaponRows.push([`Standard: ${splitCamelCase(this.standardWeaponSystemType)}`, this.standardMk, this.standardAttackBonus, this.standardRange, this.standardDamage]);
    if (this.missileMk > 0 && this.missileWeaponSystemType !== "None")
      weaponRows.push([`Missile: ${splitCamelCase(this.missileWeaponSystemType)}`, this.missileMk, this.missileAttackBonus, this.missileRange, this.missileDamage]);
    if (this.slugMk > 0 && this.slugThrowerWeaponSystemType !== "None")
      weaponRows.push([`Slug Thrower: ${splitCamelCase(this.slugThrowerWeaponSystemType)}`, this.slugMk, this.slugAttackBonus, this.slugRange, this.slugDamage]);

    let weaponsTableHTML = "";
    if (weaponRows.length > 0) {
      weaponsTableHTML = `<table class="stats-weapons"><thead><tr><th>Name</th><th>Mk</th><th>AB</th><th>Range</th><th>Damage</th></tr></thead><tbody>` +
        weaponRows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") +
        `</tbody></table>`;
    }

    const statParts = [];
    if (this.buildTons >= 100) statParts.push(fmtN0(this.buildTons) + "-ton");
    else if (this.buildTons >= 10) statParts.push(fmtN1(this.buildTons) + "-ton");
    else statParts.push(fmtN2(this.buildTons) + "-ton");

    statParts.push(`CP ${this.cpSpent}`);

    const monero = this.totalMonero;
    if (monero >= 1000) statParts.push("M" + fmtN1(monero / 1000) + "B");
    else if (monero >= 100) statParts.push("M" + fmtN0(monero) + "M");
    else if (monero >= 10) statParts.push("M" + fmtN2(monero) + "M");
    else if (monero >= 1) statParts.push("M" + fmtN1(monero) + "M");
    else statParts.push("M" + fmtN0(monero * 1000) + "k");

    statParts.push(`SB ${this.sb}`);

    if (this.transportType === "DayTrip") {
      statParts.push(this.mkOD === 0 ? `OD ${this.od * 12} Hours` : `OD ${this.od} Days`);
    } else {
      statParts.push(this.od > 1 ? `OD ${this.od} Days` : `OD ${this.od} Day`);
    }

    if (this.totalPassengers > 0) statParts.push(`${this.transportType} ${this.passengerClass} Passengers ${this.totalPassengers}`);
    if (this.totalCargoUnits > 0) statParts.push(`Cargo Units ${fmtN0(this.totalCargoUnits)}`);
    if (this.hangarSpaceTons > 0) statParts.push(`Hangar Volume ${fmtN0(this.hangarSpaceTons)} tons`);
    if (this.ghp > 0) statParts.push(`GHP ${this.ghp}`);
    if (this.qtRange > 0) statParts.push(`QT ${this.qtRange} LY`);

    lines.push("Statistics: " + statParts.join(", ") + ".");

    let interfaceLine = "Interface: " + this.environmentalInterfacePrimary;
    if (this.environmentalInterfaceSecondary !== "None") interfaceLine += `, ${this.environmentalInterfaceSecondary} (${this.tier})`;
    if (this.environmentalInterfaceTertiary !== "None") interfaceLine += `, ${this.environmentalInterfaceTertiary} (${this.tier})`;
    interfaceLine += ". ";

    const ifaceParts = [];
    if (this.warpSpeed > 0) ifaceParts.push(`Warp-${this.warpSpeed}`);
    if (this.accelG > 0) ifaceParts.push(`${this.accelG}-G`);
    if (this.aSpeed > 0) ifaceParts.push(`aSpeed ${this.aSpeed} mph`);
    if (this.gSpeed > 0) ifaceParts.push(`gSpeed ${this.gSpeed} mph`);
    if (this.oSpeed > 0) ifaceParts.push(`oSpeed ${this.oSpeed} mph`);
    if (this.wSpeed > 0) ifaceParts.push(`wSpeed ${this.wSpeed} mph`);
    if (this.uSpeed > 0) ifaceParts.push(`uSpeed ${this.uSpeed} mph`);
    if (this.mkHpress > 0) ifaceParts.push(`Atms ${this.atms}`);
    if (this.interfaceOption === "Aquaform") ifaceParts.push(`Aquaform (${this.cpCostInterfaceOptions})`);
    if (this.interfaceOption === "TailLander") ifaceParts.push(`Tail Lander (${this.cpCostInterfaceOptions})`);
    if (this.interfaceOption === "Voidbound") ifaceParts.push(`Void-Bound (${this.cpCostInterfaceOptions})`);

    interfaceLine += ifaceParts.join(", ") + ".";
    lines.push(interfaceLine);

    const boldLeadingLabel = (line) => {
      const m = /^([A-Za-z ]+:)(.*)$/.exec(line);
      return m ? `<strong>${esc(m[1])}</strong>${esc(m[2])}` : esc(line);
    };

    const bodyHTML =
      `<div class="stats-title">${esc(this.vehicleTitle)}</div>` +
      lines.map((l) => `<div>${boldLeadingLabel(l)}</div>`).join("") +
      weaponsTableHTML +
      (this.vehicleDescription ? `<div class="stats-description">${esc(this.vehicleDescription).replace(/\n/g, "<br>")}</div>` : "");

    return bodyHTML;
  }

  // Serialization
  toJSON() {
    const plain = { ...this };
    plain.selectedTraits = this.selectedTraits.map((t) => ({ ...t }));
    plain.selectedBoutiqueServices = this.selectedBoutiqueServices.map((b) => ({ ...b }));
    return plain;
  }

  static fromJSON(data) {
    const vehicle = new VehicleData();
    Object.assign(vehicle, data);
    vehicle.selectedTraits = (data.selectedTraits || []).map((t) => new Trait(t));
    vehicle.selectedBoutiqueServices = (data.selectedBoutiqueServices || []).map((b) => new BoutiqueService(b));
    if (!vehicle.id) vehicle.id = generateId();
    return vehicle;
  }

  static createNew() {
    const v = new VehicleData();
    return v;
  }

  // Import from the original desktop app's .wsv XML format (XmlSerializer output).
  // XML tag -> [jsField, type]. Also covers pre-rename field names from older saves
  // (RailgunMk/RailgunWeaponSystemType -> slugMk/slugThrowerWeaponSystemType).
  static get WSV_XML_FIELDS() {
    return {
      dirty: ["dirty", "bool"],
      VehicleName: ["vehicleName", "string"],
      VehicleClass: ["vehicleClass", "string"],
      VehicleMission: ["vehicleMission", "string"],
      VehicleDescription: ["vehicleDescription", "string"],
      Tier: ["tier", "int"],
      TL: ["tl", "int"],
      AIControlLevel: ["aiControlLevel", "int"], AIEWLevel: ["aiEWLevel", "int"],
      AIGunnerLevel: ["aiGunnerLevel", "int"], AINavLevel: ["aiNavLevel", "int"],
      AIResearchLevel: ["aiResearchLevel", "int"], AISecurityLevel: ["aiSecurityLevel", "int"],
      AISensorsLevel: ["aiSensorsLevel", "int"],
      CrewControlLevel: ["crewControlLevel", "int"], CrewEWLevel: ["crewEWLevel", "int"],
      CrewGunnerLevel: ["crewGunnerLevel", "int"], CrewNavLevel: ["crewNavLevel", "int"],
      CrewResearchLevel: ["crewResearchLevel", "int"], CrewSecurityLevel: ["crewSecurityLevel", "int"],
      CrewSensorsLevel: ["crewSensorsLevel", "int"],
      LevelArmor: ["levelArmor", "int"], LevelBC: ["levelBC", "int"], LevelCH: ["levelCH", "int"],
      LevelDC: ["levelDC", "int"], LevelGH: ["levelGH", "int"], LevelHS: ["levelHS", "int"],
      LevelHpress: ["levelHpress", "int"], LevelOD: ["levelOD", "int"], LevelQT: ["levelQT", "int"],
      LevelRP: ["levelRP", "int"], LevelStealth: ["levelStealth", "int"], LevelThrust: ["levelThrust", "int"],
      LevelWarp: ["levelWarp", "int"],
      BonusArmor: ["bonusArmor", "int"], BonusBC: ["bonusBC", "int"], BonusCH: ["bonusCH", "int"],
      BonusDC: ["bonusDC", "int"], BonusGH: ["bonusGH", "int"], BonusHS: ["bonusHS", "int"],
      BonusHpress: ["bonusHpress", "int"], BonusOD: ["bonusOD", "int"], BonusQT: ["bonusQT", "int"],
      BonusRP: ["bonusRP", "int"], BonusStealth: ["bonusStealth", "int"], BonusThrust: ["bonusThrust", "int"],
      BonusWarp: ["bonusWarp", "int"],
      CapitalMk: ["capitalMk", "int"], StandardMk: ["standardMk", "int"], MissileMk: ["missileMk", "int"],
      SlugMk: ["slugMk", "int"], RailgunMk: ["slugMk", "int"],
      CapitalWeaponSystemType: ["capitalWeaponSystemType", "string"],
      StandardWeaponSystemType: ["standardWeaponSystemType", "string"],
      MissileWeaponSystemType: ["missileWeaponSystemType", "string"],
      SlugThrowerWeaponSystemType: ["slugThrowerWeaponSystemType", "string"],
      RailgunWeaponSystemType: ["slugThrowerWeaponSystemType", "string"],
      CrewClass: ["crewClass", "string"],
      CompartmentalizationSelected: ["compartmentalizationSelected", "string"],
      FrameStrengthSelected: ["frameStrengthSelected", "string"],
      EnvironmentalInterfacePrimary: ["environmentalInterfacePrimary", "string"],
      EnvironmentalInterfaceSecondary: ["environmentalInterfaceSecondary", "string"],
      EnvironmentalInterfaceTertiary: ["environmentalInterfaceTertiary", "string"],
      VTOLATOL: ["vtolAtol", "bool"],
      IncludesLifeSupport: ["includesLifeSupport", "bool"],
      InterfaceOption: ["interfaceOption", "string"],
      TransportType: ["transportType", "string"],
      PassengerClass: ["passengerClass", "string"],
      ActualMaxTons: ["actualMaxTons", "float"],
    };
  }

  static parseWsvXmlValue(text, type) {
    const t = (text ?? "").trim();
    switch (type) {
      case "bool": return t.toLowerCase() === "true";
      case "int": { const n = parseInt(t, 10); return Number.isNaN(n) ? 0 : n; }
      case "float": { const n = parseFloat(t); return Number.isNaN(n) ? 0 : n; }
      default: return t;
    }
  }

  static parseWsvTraitElement(el) {
    const get = (tag) => el.getElementsByTagName(tag)[0]?.textContent ?? "";
    return new Trait({
      traitName: get("TraitName"),
      baseCP: get("BaseCP"),
      maxLevel: parseInt(get("MaxLevel"), 10) || 0,
      prerequisite: get("Prerequisite"),
      note: get("Note"),
      selectedLevel: parseInt(get("SelectedLevel"), 10) || 1,
    });
  }

  static parseWsvBoutiqueElement(el) {
    const get = (tag) => el.getElementsByTagName(tag)[0]?.textContent ?? "";
    return new BoutiqueService({
      boutiqueServiceName: get("BoutiqueServiceName"),
      baseCP: get("BaseCP"),
      note: get("Note"),
    });
  }

  static fromWsvXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) {
      throw new Error("Not a valid .wsv file (XML parse error)");
    }

    const root = doc.documentElement;
    if (!root || root.tagName !== "VehicleData") {
      throw new Error("Not a recognized WSVB .wsv file");
    }

    const vehicle = new VehicleData();
    const fieldMap = VehicleData.WSV_XML_FIELDS;

    for (const child of Array.from(root.children)) {
      const tag = child.tagName;

      if (tag === "SelectedTraits") {
        vehicle.selectedTraits = Array.from(child.getElementsByTagName("Trait")).map(VehicleData.parseWsvTraitElement);
        continue;
      }
      if (tag === "SelectedBoutiqueServices") {
        vehicle.selectedBoutiqueServices = Array.from(child.getElementsByTagName("BoutiqueService")).map(VehicleData.parseWsvBoutiqueElement);
        continue;
      }

      const mapping = fieldMap[tag];
      if (!mapping) continue; // unrecognized/obsolete field - ignore
      const [field, type] = mapping;
      vehicle[field] = VehicleData.parseWsvXmlValue(child.textContent, type);
    }

    vehicle.id = generateId();
    vehicle.fileName = "";
    vehicle.dirty = false;
    return vehicle;
  }

  // Export to the original desktop app's .wsv XML format. Field order matches
  // the C# VehicleData property declaration order exactly (XmlSerializer emits
  // properties in declaration order), so round-tripping through either app works.
  static get WSV_EXPORT_FIELDS() {
    return [
      ["dirty", "dirty", "bool"],
      ["VehicleName", "vehicleName", "string"],
      ["VehicleClass", "vehicleClass", "string"],
      ["VehicleMission", "vehicleMission", "string"],
      ["VehicleDescription", "vehicleDescription", "string"],
      ["Tier", "tier", "int"],
      ["TL", "tl", "int"],
      // -- SelectedTraits / SelectedBoutiqueServices go here (handled separately) --
      ["AIControlLevel", "aiControlLevel", "int"], ["AIEWLevel", "aiEWLevel", "int"],
      ["AIGunnerLevel", "aiGunnerLevel", "int"], ["AINavLevel", "aiNavLevel", "int"],
      ["AIResearchLevel", "aiResearchLevel", "int"], ["AISecurityLevel", "aiSecurityLevel", "int"],
      ["AISensorsLevel", "aiSensorsLevel", "int"],
      ["CrewControlLevel", "crewControlLevel", "int"], ["CrewEWLevel", "crewEWLevel", "int"],
      ["CrewGunnerLevel", "crewGunnerLevel", "int"], ["CrewNavLevel", "crewNavLevel", "int"],
      ["CrewResearchLevel", "crewResearchLevel", "int"], ["CrewSecurityLevel", "crewSecurityLevel", "int"],
      ["CrewSensorsLevel", "crewSensorsLevel", "int"],
      ["LevelArmor", "levelArmor", "int"], ["LevelBC", "levelBC", "int"], ["LevelCH", "levelCH", "int"],
      ["LevelDC", "levelDC", "int"], ["LevelGH", "levelGH", "int"], ["LevelHS", "levelHS", "int"],
      ["LevelHpress", "levelHpress", "int"], ["LevelOD", "levelOD", "int"], ["LevelQT", "levelQT", "int"],
      ["LevelRP", "levelRP", "int"], ["LevelStealth", "levelStealth", "int"], ["LevelThrust", "levelThrust", "int"],
      ["LevelWarp", "levelWarp", "int"],
      ["BonusArmor", "bonusArmor", "int"], ["BonusBC", "bonusBC", "int"], ["BonusCH", "bonusCH", "int"],
      ["BonusDC", "bonusDC", "int"], ["BonusGH", "bonusGH", "int"], ["BonusHS", "bonusHS", "int"],
      ["BonusHpress", "bonusHpress", "int"], ["BonusOD", "bonusOD", "int"], ["BonusQT", "bonusQT", "int"],
      ["BonusRP", "bonusRP", "int"], ["BonusStealth", "bonusStealth", "int"], ["BonusThrust", "bonusThrust", "int"],
      ["BonusWarp", "bonusWarp", "int"],
      ["CapitalMk", "capitalMk", "int"], ["StandardMk", "standardMk", "int"], ["MissileMk", "missileMk", "int"],
      ["SlugMk", "slugMk", "int"],
      ["CapitalWeaponSystemType", "capitalWeaponSystemType", "string"],
      ["StandardWeaponSystemType", "standardWeaponSystemType", "string"],
      ["MissileWeaponSystemType", "missileWeaponSystemType", "string"],
      ["SlugThrowerWeaponSystemType", "slugThrowerWeaponSystemType", "string"],
      ["CrewClass", "crewClass", "string"],
      ["CompartmentalizationSelected", "compartmentalizationSelected", "string"],
      ["FrameStrengthSelected", "frameStrengthSelected", "string"],
      ["EnvironmentalInterfacePrimary", "environmentalInterfacePrimary", "string"],
      ["EnvironmentalInterfaceSecondary", "environmentalInterfaceSecondary", "string"],
      ["EnvironmentalInterfaceTertiary", "environmentalInterfaceTertiary", "string"],
      ["VTOLATOL", "vtolAtol", "bool"],
      ["IncludesLifeSupport", "includesLifeSupport", "bool"],
      ["InterfaceOption", "interfaceOption", "string"],
      ["TransportType", "transportType", "string"],
      ["PassengerClass", "passengerClass", "string"],
      ["ActualMaxTons", "actualMaxTons", "float"],
    ];
  }

  static wsvEscape(s) {
    return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  static wsvElement(indent, tag, value, type) {
    const pad = "  ".repeat(indent);
    if (type === "bool") return `${pad}<${tag}>${value ? "true" : "false"}</${tag}>`;
    if (type === "int" || type === "float") return `${pad}<${tag}>${value}</${tag}>`;
    const s = value ?? "";
    return s === "" ? `${pad}<${tag} />` : `${pad}<${tag}>${VehicleData.wsvEscape(s)}</${tag}>`;
  }

  toWsvXml() {
    const lines = ['<?xml version="1.0" encoding="utf-8"?>',
      '<VehicleData xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">'];

    const fields = VehicleData.WSV_EXPORT_FIELDS;
    const upTo = (tag) => fields.slice(0, fields.findIndex((f) => f[0] === tag) + 1);
    const after = (tag) => fields.slice(fields.findIndex((f) => f[0] === tag) + 1);

    for (const [tag, field, type] of upTo("TL")) {
      lines.push(VehicleData.wsvElement(1, tag, this[field], type));
    }

    if (this.selectedTraits.length === 0) {
      lines.push("  <SelectedTraits />");
    } else {
      lines.push("  <SelectedTraits>");
      for (const t of this.selectedTraits) {
        lines.push("    <Trait>");
        lines.push(VehicleData.wsvElement(3, "TraitName", t.traitName, "string"));
        lines.push(VehicleData.wsvElement(3, "BaseCP", t.baseCP, "string"));
        lines.push(VehicleData.wsvElement(3, "MaxLevel", t.maxLevel, "int"));
        lines.push(VehicleData.wsvElement(3, "Prerequisite", t.prerequisite, "string"));
        lines.push(VehicleData.wsvElement(3, "Note", t.note, "string"));
        lines.push(VehicleData.wsvElement(3, "SelectedLevel", t.selectedLevel, "int"));
        lines.push("    </Trait>");
      }
      lines.push("  </SelectedTraits>");
    }

    if (this.selectedBoutiqueServices.length === 0) {
      lines.push("  <SelectedBoutiqueServices />");
    } else {
      lines.push("  <SelectedBoutiqueServices>");
      for (const b of this.selectedBoutiqueServices) {
        lines.push("    <BoutiqueService>");
        lines.push(VehicleData.wsvElement(3, "BoutiqueServiceName", b.boutiqueServiceName, "string"));
        lines.push(VehicleData.wsvElement(3, "BaseCP", b.baseCP, "string"));
        lines.push(VehicleData.wsvElement(3, "Note", b.note, "string"));
        lines.push("    </BoutiqueService>");
      }
      lines.push("  </SelectedBoutiqueServices>");
    }

    for (const [tag, field, type] of after("TL")) {
      lines.push(VehicleData.wsvElement(1, tag, this[field], type));
    }

    lines.push("</VehicleData>");
    return lines.join("\r\n");
  }

  clone() {
    const copy = VehicleData.fromJSON(JSON.parse(JSON.stringify(this.toJSON())));
    copy.id = generateId();
    copy.fileName = "";
    copy.dirty = true;
    return copy;
  }
}
