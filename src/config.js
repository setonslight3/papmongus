// Game configuration constants for papmongus

export const TILE_SIZE = 32;
export const MAP_COLS = 50;
export const MAP_ROWS = 40;

export const SCREEN_WIDTH = 960;
export const SCREEN_HEIGHT = 540; // 16:9 Aspect Ratio

export const PLAYER_SPEED = 3.5;
export const VISION_RADIUS_CREW = 180;
export const VISION_RADIUS_IMPOSTOR = 260;
export const VISION_RADIUS_SABOTAGED = 60;

export const KILL_COOLDOWN = 20000; // 20 seconds
export const KILL_RANGE = 60; // Pixels

export const SABOTAGE_COOLDOWN = 30000; // 30 seconds
export const SABOTAGE_DURATION = 30000; // 30 seconds for Reactor Meltdown countdown

export const COLORS = {
  red: '#ff1a1a',
  blue: '#1a53ff',
  green: '#1acc33',
  yellow: '#ffdb1a',
  purple: '#a61aff',
  orange: '#ff881a',
  cyan: '#1affd8',
  pink: '#ff1ae2',
  white: '#ffffff',
  black: '#111111',
  shadow: 'rgba(0, 0, 0, 0.45)',
  wall: '#333b4d',
  floor: '#1b2230',
  accent: '#ff0055'
};

// Input controls configuration
export const CONTROLS = {
  P1: {
    up: 'KeyW',
    down: 'KeyS',
    left: 'KeyA',
    right: 'KeyD',
    use: 'KeyE',
    kill: 'KeyQ',
    vent: 'KeyF',
    report: 'KeyR'
  },
  P2: {
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    use: 'Numpad1',
    kill: 'Numpad3',
    vent: 'Numpad0',
    report: 'Numpad2'
  }
};

// Tasks list
export const TASKS_LIST = [
  { id: 'wires_electrical', name: 'Fix Wiring', room: 'Electrical', type: 'wires' },
  { id: 'wires_cafeteria', name: 'Fix Wiring', room: 'Cafeteria', type: 'wires' },
  { id: 'wires_security', name: 'Fix Wiring', room: 'Security', type: 'wires' },
  { id: 'wires_storage', name: 'Fix Wiring', room: 'Storage', type: 'wires' },
  { id: 'wires_navigation', name: 'Fix Wiring', room: 'Navigation', type: 'wires' },
  { id: 'wires_admin', name: 'Fix Wiring', room: 'Admin', type: 'wires' },
  { id: 'swipe_admin', name: 'Swipe Card', room: 'Admin', type: 'swipe' },
  { id: 'upload_admin', name: 'Upload Data', room: 'Admin', type: 'upload' },
  { id: 'upload_cafeteria', name: 'Download Data', room: 'Cafeteria', type: 'upload' },
  { id: 'upload_medbay', name: 'Download Data', room: 'Medbay', type: 'upload' },
  { id: 'upload_weapons', name: 'Download Data', room: 'Weapons', type: 'upload' },
  { id: 'upload_navigation', name: 'Download Data', room: 'Navigation', type: 'upload' },
  { id: 'upload_communications', name: 'Download Data', room: 'Communication', type: 'upload' },
  { id: 'upload_shields', name: 'Download Data', room: 'Shields', type: 'upload' },
  { id: 'asteroids_weapons', name: 'Clear Asteroids', room: 'Weapons', type: 'asteroids' },
  { id: 'fuel_upper_engine', name: 'Fuel Engines', room: 'Upper Engine', type: 'fuel' },
  { id: 'fuel_lower_engine', name: 'Fuel Engines', room: 'Lower Engine', type: 'fuel' },
  { id: 'leaves_o2', name: 'Clean O2 Filter', room: 'O2', type: 'leaves' },
  { id: 'calibrate_navigation', name: 'Calibrate Distributor', room: 'Navigation', type: 'calibrate' },
  { id: 'calibrate_electrical', name: 'Calibrate Distributor', room: 'Electrical', type: 'calibrate' },
  { id: 'leaves_reactor', name: 'Clean Vent Filter', room: 'Reactor', type: 'leaves' },
  { id: 'asteroids_shields', name: 'Clear Asteroids', room: 'Shields', type: 'asteroids' },
  { id: 'fuel_storage', name: 'Fill Canisters', room: 'Storage', type: 'fuel' },
  { id: 'swipe_security', name: 'Swipe Card', room: 'Security', type: 'swipe' }
];

// Rooms boundaries/names mapping with visual themes
export const ROOMS = [
  { name: 'Cafeteria',   colStart: 20, colEnd: 30, rowStart: 2,  rowEnd: 10, floor: '#1a2636', accent: '#2980b9', glow: 'rgba(41,128,185,0.08)' },
  { name: 'Weapons',     colStart: 36, colEnd: 42, rowStart: 4,  rowEnd: 9,  floor: '#2a1e2d', accent: '#9b59b6', glow: 'rgba(155,89,182,0.08)' },
  { name: 'Upper Engine',colStart: 8,  colEnd: 14, rowStart: 4,  rowEnd: 9,  floor: '#2d2d30', accent: '#7f8c8d', glow: 'rgba(127,140,141,0.08)' },
  { name: 'Medbay',      colStart: 12, colEnd: 17, rowStart: 11, rowEnd: 16, floor: '#1e2630', accent: '#1abc9c', glow: 'rgba(26,188,156,0.08)' },
  { name: 'Reactor',     colStart: 2,  colEnd: 7,  rowStart: 14, rowEnd: 22, floor: '#2a1a1a', accent: '#e74c3c', glow: 'rgba(231,76,60,0.1)' },
  { name: 'Security',    colStart: 15, colEnd: 20, rowStart: 18, rowEnd: 23, floor: '#1a2a1e', accent: '#27ae60', glow: 'rgba(39,174,96,0.08)' },
  { name: 'Lower Engine',colStart: 8,  colEnd: 14, rowStart: 27, rowEnd: 32, floor: '#2d2d30', accent: '#7f8c8d', glow: 'rgba(127,140,141,0.08)' },
  { name: 'Electrical',  colStart: 18, colEnd: 23, rowStart: 23, rowEnd: 29, floor: '#1f2a1a', accent: '#f39c12', glow: 'rgba(243,156,18,0.08)' },
  { name: 'Storage',     colStart: 24, colEnd: 29, rowStart: 24, rowEnd: 33, floor: '#202025', accent: '#95a5a6', glow: 'rgba(149,165,166,0.08)' },
  { name: 'Admin',       colStart: 31, colEnd: 37, rowStart: 18, rowEnd: 23, floor: '#1c2230', accent: '#8e44ad', glow: 'rgba(142,68,173,0.08)' },
  { name: 'O2',          colStart: 33, colEnd: 38, rowStart: 11, rowEnd: 16, floor: '#1a2530', accent: '#00bcd4', glow: 'rgba(0,188,212,0.08)' },
  { name: 'Navigation',  colStart: 42, colEnd: 47, rowStart: 13, rowEnd: 21, floor: '#181e2e', accent: '#3498db', glow: 'rgba(52,152,219,0.08)' },
  { name: 'Shields',     colStart: 37, colEnd: 43, rowStart: 25, rowEnd: 30, floor: '#2a251e', accent: '#e67e22', glow: 'rgba(230,126,34,0.08)' },
  { name: 'Communication',colStart: 31,colEnd: 36, rowStart: 31, rowEnd: 35, floor: '#1a1a24', accent: '#bdc3c7', glow: 'rgba(189,195,199,0.08)' }
];

