// Unit and projectile models (contract section 9.2). The builders live in models/*; this module is the
// public entry point and picks the right one for a unit type.
import { SoldierModel } from './models/soldier.js';
import { createMuzzleFlash } from './models/kit.js';
import { JeepModel } from './models/jeep.js';
import { TankModel } from './models/tank.js';
import { JetModel } from './models/jet.js';
import { HeliModel } from './models/heli.js';
import { MlrsModel } from './models/mlrs.js';
import { DroneModel } from './models/drone.js';
import { createProjectileModel as buildProjectile } from './models/projectiles.js';
import { sanitizeSuit } from './shared/suit-options.js';

export function createUnitModel(type, { team = 'def', suit = null, quality = 'high' } = {}) {
  const s = suit ? sanitizeSuit(suit) : null;
  switch (type) {
    case 'soldier': {
      const m = new SoldierModel({ team, suit: s, quality });
      m.setFlashFactory(createMuzzleFlash);
      return m;
    }
    case 'jeep': return new JeepModel({ team, suit: s, quality });
    case 'tank': return new TankModel({ team, suit: s, quality });
    case 'mlrs': return new MlrsModel({ team, suit: s, quality });
    case 'drone': return new DroneModel({ team, suit: s, quality });
    case 'heli': return new HeliModel({ team, suit: s, quality });
    case 'jet': return new JetModel({ team, suit: s, quality });
    default:
      throw new Error('createUnitModel: unknown unit type ' + type);
  }
}

// Projectile models point along +x and share their geometry and materials (nothing to dispose per instance).
export function createProjectileModel(kind, team = 'def') {
  return buildProjectile(kind, team);
}
