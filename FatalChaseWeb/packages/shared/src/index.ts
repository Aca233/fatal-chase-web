export type Vec2 = {
  x: number;
  y: number;
};

export type LimbKey = "head" | "torso" | "leftArm" | "rightArm" | "leftLeg" | "rightLeg";

export type LimbCondition = "intact" | "damaged" | "severed";

export type LimbState = Record<LimbKey, LimbCondition>;

export type InputCommand = {
  move: Vec2;
  aim: Vec2;
  charging: boolean;
  fire: boolean;
  cancelCharge: boolean;
  roll: boolean;
  parry: boolean;
};

export type CombatantState = {
  id: string;
  name: string;
  position: Vec2;
  velocity: Vec2;
  facing: number;
  limbs: LimbState;
  targetId: string;
  score: number;
  isRolling: boolean;
  rollCooldown: number;
  parryCooldown: number;
  parrySeconds: number;
  protectionSeconds: number;
};

export const defaultLimbs = (): LimbState => ({
  head: "intact",
  torso: "intact",
  leftArm: "intact",
  rightArm: "intact",
  leftLeg: "intact",
  rightLeg: "intact"
});

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

export const length = (vector: Vec2): number => {
  return Math.hypot(vector.x, vector.y);
};

export const normalize = (vector: Vec2): Vec2 => {
  const magnitude = length(vector);
  if (magnitude === 0) {
    return { x: 0, y: 0 };
  }
  return { x: vector.x / magnitude, y: vector.y / magnitude };
};

export const distance = (a: Vec2, b: Vec2): number => {
  return Math.hypot(a.x - b.x, a.y - b.y);
};

export const createHuntChain = (ids: string[]): Record<string, string> => {
  if (ids.length < 2) {
    throw new Error("Hunt chain needs at least two combatants");
  }
  return ids.reduce<Record<string, string>>((chain, id, index) => {
    chain[id] = ids[(index + 1) % ids.length] as string;
    return chain;
  }, {});
};

export const resolveTargetAfterKill = (
  hunterId: string,
  killerId: string,
  victimId: string,
  chain: Record<string, string>
): string => {
  if (chain[hunterId] !== victimId) {
    return chain[hunterId] ?? killerId;
  }
  if (killerId !== hunterId) {
    return killerId;
  }
  return chain[victimId] ?? killerId;
};
