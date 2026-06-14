import { Container, Graphics } from "pixi.js";
import type { CombatantState, InputCommand, Vec2 } from "@fatal-chase/shared";
import { clamp, defaultLimbs, normalize } from "@fatal-chase/shared";

const baseSpeed = 245;
const rollSeconds = 0.5;
const rollCooldownSeconds = 3.5;
const parrySeconds = 0.24;
const parryCooldownSeconds = 2.4;
const bowTipBackOffset = 4.5;
const bowTipSideOffset = 13.5;

type MovementContext = {
  speedMultiplier?: number;
  concealed?: boolean;
  solidZones?: SolidZone[];
};

type SolidZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type LoadedArrow = {
  tail: Vec2;
  tip: Vec2;
  center: Vec2;
  headLeft: Vec2;
  headRight: Vec2;
  featherLeft: Vec2;
  featherRight: Vec2;
};

export class Combatant {
  readonly view = new Container();
  readonly state: CombatantState;
  private readonly protectionRing = new Graphics();
  private readonly body = new Graphics();
  private readonly aimLine = new Graphics();
  private readonly bowBody = new Graphics();
  private readonly bowString = new Graphics();
  private rollTimer = 0;
  private rollDirection: Vec2 = { x: 1, y: 0 };
  private lastChargeRatio = 0;
  private shotTimer = 0;

  constructor(id: string, name: string, position: Vec2, targetId: string) {
    this.state = {
      id,
      name,
      position,
      velocity: { x: 0, y: 0 },
      facing: 0,
      limbs: defaultLimbs(),
      targetId,
      score: 0,
      isRolling: false,
      rollCooldown: 0,
      parryCooldown: 0,
      parrySeconds: 0,
      protectionSeconds: 0
    };
    this.view.addChild(this.protectionRing, this.aimLine, this.body, this.bowBody, this.bowString);
    this.syncView();
  }

  update(
    command: InputCommand,
    deltaSeconds: number,
    arena: { width: number; height: number },
    context: MovementContext = {},
    chargeRatio = command.charging ? 1 : 0
  ): void {
    this.faceToward(command.aim);

    this.state.rollCooldown = Math.max(0, this.state.rollCooldown - deltaSeconds);
    this.state.parryCooldown = Math.max(0, this.state.parryCooldown - deltaSeconds);
    this.state.parrySeconds = Math.max(0, this.state.parrySeconds - deltaSeconds);
    this.state.protectionSeconds = Math.max(0, this.state.protectionSeconds - deltaSeconds);
    this.shotTimer = Math.max(0, this.shotTimer - deltaSeconds);
    if (command.parry && this.state.parryCooldown === 0 && this.getChargeMultiplier() > 0) {
      this.state.parrySeconds = parrySeconds;
      this.state.parryCooldown = parryCooldownSeconds;
      this.state.protectionSeconds = 0;
    }
    if (command.roll && this.state.rollCooldown === 0 && !this.hasLostBothLegs()) {
      this.rollTimer = rollSeconds;
      this.state.rollCooldown = rollCooldownSeconds;
      this.rollDirection =
        command.move.x || command.move.y
          ? command.move
          : { x: Math.cos(this.state.facing), y: Math.sin(this.state.facing) };
    }

    this.state.isRolling = this.rollTimer > 0;
    this.rollTimer = Math.max(0, this.rollTimer - deltaSeconds);

    const multiplier = context.speedMultiplier ?? 1;
    const speed = (this.state.isRolling ? 620 : this.getMoveSpeed()) * multiplier;
    const direction = this.state.isRolling ? this.rollDirection : command.move;
    this.state.velocity = { x: direction.x * speed, y: direction.y * speed };
    this.state.position.x = clamp(this.state.position.x + this.state.velocity.x * deltaSeconds, 40, arena.width - 40);
    this.state.position.y = clamp(this.state.position.y + this.state.velocity.y * deltaSeconds, 40, arena.height - 40);
    resolveSolidZones(this.state.position, context.solidZones ?? [], 24);
    this.state.position.x = clamp(this.state.position.x, 40, arena.width - 40);
    this.state.position.y = clamp(this.state.position.y, 40, arena.height - 40);

    this.lastChargeRatio = command.charging ? clamp(chargeRatio, 0, 1) : 0;
    this.syncView(this.lastChargeRatio, context.concealed ?? false);
  }

  sever(limb: keyof CombatantState["limbs"]): void {
    this.state.limbs[limb] = "severed";
    this.syncView(0, false);
  }

  reset(position: Vec2): void {
    this.state.position = { ...position };
    this.state.velocity = { x: 0, y: 0 };
    this.state.limbs = defaultLimbs();
    this.state.rollCooldown = 0;
    this.state.parryCooldown = 0;
    this.state.parrySeconds = 0;
    this.state.protectionSeconds = 0;
    this.rollTimer = 0;
    this.syncView(0, false);
  }

  protect(seconds: number): void {
    this.state.protectionSeconds = Math.max(this.state.protectionSeconds, seconds);
    this.syncView(this.lastChargeRatio, false);
  }

  clearProtection(): void {
    this.state.protectionSeconds = 0;
  }

  playShot(): void {
    this.shotTimer = 0.16;
    this.syncView(0, false);
  }

  getChargeMultiplier(): number {
    const leftArmGone = this.state.limbs.leftArm === "severed";
    const rightArmGone = this.state.limbs.rightArm === "severed";
    if (leftArmGone && rightArmGone) {
      return 0;
    }
    if (leftArmGone || rightArmGone) {
      return 0.65;
    }
    return 1;
  }

  faceToward(point: Vec2): void {
    const aimDirection = normalize({
      x: point.x - this.state.position.x,
      y: point.y - this.state.position.y
    });
    if (aimDirection.x !== 0 || aimDirection.y !== 0) {
      this.state.facing = Math.atan2(aimDirection.y, aimDirection.x);
    }
  }

  getLoadedArrowWorldPosition(chargeRatio = this.lastChargeRatio): Vec2 {
    const localArrow = this.getLoadedArrow(this.createPose(chargeRatio), chargeRatio);
    return {
      x: this.state.position.x + localArrow.center.x,
      y: this.state.position.y + localArrow.center.y
    };
  }

  getHitLimb(point: Vec2): keyof CombatantState["limbs"] | null {
    const local = { x: point.x - this.state.position.x, y: point.y - this.state.position.y };
    const pose = this.createPose(this.lastChargeRatio);
    const candidates: Array<{ limb: keyof CombatantState["limbs"]; distance: number }> = [
      { limb: "head", distance: Math.hypot(local.x - pose.head.x, local.y - pose.head.y) - 14 },
      { limb: "torso", distance: distanceToSegment(local, pose.neck, pose.hip) - 11 },
      { limb: "leftArm", distance: Math.min(distanceToSegment(local, pose.leftShoulder, pose.leftElbow), distanceToSegment(local, pose.leftElbow, pose.leftHand)) - 7 },
      { limb: "rightArm", distance: Math.min(distanceToSegment(local, pose.rightShoulder, pose.rightElbow), distanceToSegment(local, pose.rightElbow, pose.rightHand)) - 7 },
      { limb: "leftLeg", distance: Math.min(distanceToSegment(local, pose.leftHip, pose.leftKnee), distanceToSegment(local, pose.leftKnee, pose.leftFoot)) - 7 },
      { limb: "rightLeg", distance: Math.min(distanceToSegment(local, pose.rightHip, pose.rightKnee), distanceToSegment(local, pose.rightKnee, pose.rightFoot)) - 7 }
    ];
    candidates.sort((a, b) => a.distance - b.distance);
    return candidates[0] && candidates[0].distance <= 10 ? candidates[0].limb : null;
  }

  private getMoveSpeed(): number {
    const leftLegGone = this.state.limbs.leftLeg === "severed";
    const rightLegGone = this.state.limbs.rightLeg === "severed";
    if (leftLegGone && rightLegGone) {
      return baseSpeed * 0.25;
    }
    if (leftLegGone || rightLegGone) {
      return baseSpeed * 0.6;
    }
    return baseSpeed;
  }

  private hasLostBothLegs(): boolean {
    return this.state.limbs.leftLeg === "severed" && this.state.limbs.rightLeg === "severed";
  }

  private syncView(chargeRatio = 0, concealed = false): void {
    this.view.position.set(this.state.position.x, this.state.position.y);
    this.view.alpha = concealed ? 0.38 : 1;
    this.protectionRing.clear();
    this.body.clear();
    this.aimLine.clear();
    this.bowBody.clear();
    this.bowString.clear();

    const danger = this.state.isRolling ? 0xe8d8b1 : 0xf3eee2;
    const charging = chargeRatio > 0;
    const pose = this.createPose(chargeRatio);
    const aimOrigin = this.getLoadedArrow(pose, chargeRatio).center;
    const facing = { x: Math.cos(this.state.facing), y: Math.sin(this.state.facing) };
    this.aimLine
      .moveTo(aimOrigin.x, aimOrigin.y)
      .lineTo(
        aimOrigin.x + facing.x * (62 + chargeRatio * 36),
        aimOrigin.y + facing.y * (62 + chargeRatio * 36)
      )
      .stroke({ color: charging ? 0xd43821 : 0xdccca8, width: charging ? 3 : 1, alpha: charging ? 0.95 : 0.45 });
    this.drawChargeMeter(chargeRatio);
    this.syncBow(pose, chargeRatio);
    this.drawProtectionRing();
    this.drawParryArc();

    this.body.circle(pose.head.x, pose.head.y, 13).fill(danger);
    this.drawSegment("torso", pose.neck, pose.hip, 10, danger);
    this.drawJoint(pose.neck, danger);
    this.drawJoint(pose.hip, danger);
    this.drawLimb("leftArm", pose.leftShoulder, pose.leftElbow, pose.leftHand, danger);
    this.drawLimb("rightArm", pose.rightShoulder, pose.rightElbow, pose.rightHand, danger);
    this.drawLimb("leftLeg", pose.leftHip, pose.leftKnee, pose.leftFoot, danger);
    this.drawLimb("rightLeg", pose.rightHip, pose.rightKnee, pose.rightFoot, danger);
  }

  private drawLimb(limb: keyof CombatantState["limbs"], a: Vec2, b: Vec2, c: Vec2, color: number): void {
    if (this.state.limbs[limb] === "severed") {
      this.body.circle(a.x, a.y, 4).fill(0x9c1f18);
      return;
    }
    this.drawSegment(limb, a, b, 7, color);
    this.drawSegment(limb, b, c, 6, color);
    this.drawJoint(b, color);
    this.drawJoint(c, color);
  }

  private drawSegment(limb: keyof CombatantState["limbs"], a: Vec2, b: Vec2, width: number, color: number): void {
    if (this.state.limbs[limb] === "severed") {
      return;
    }
    this.body.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width, cap: "round" });
  }

  private drawJoint(point: Vec2, color: number): void {
    this.body.circle(point.x, point.y, 3.5).fill(color);
  }

  private drawChargeMeter(chargeRatio: number): void {
    if (chargeRatio <= 0) {
      return;
    }
    const start = -Math.PI / 2;
    this.bowString.arc(0, 20, 34, start, start + Math.PI * 2 * chargeRatio).stroke({
      color: chargeRatio >= 0.96 ? 0xf3eee2 : 0xd43821,
      width: 2.5,
      alpha: 0.35 + chargeRatio * 0.45
    });
  }

  private drawProtectionRing(): void {
    if (this.state.protectionSeconds <= 0) {
      return;
    }
    const progress = clamp(this.state.protectionSeconds / 2, 0, 1);
    this.protectionRing
      .circle(0, 38, 41 + Math.sin(performance.now() / 90) * 2)
      .stroke({ color: 0xf5e4b6, width: 2, alpha: 0.22 + progress * 0.38 });
    this.protectionRing
      .moveTo(-28, 72)
      .lineTo(28, 72)
      .stroke({ color: 0xd43821, width: 2, alpha: 0.18 + progress * 0.28 });
  }

  private drawParryArc(): void {
    if (this.state.parrySeconds <= 0) {
      return;
    }
    const progress = clamp(this.state.parrySeconds / parrySeconds, 0, 1);
    const facing = this.state.facing;
    const start = facing - Math.PI * 0.42;
    const end = facing + Math.PI * 0.42;
    this.protectionRing.arc(0, 36, 52 + progress * 10, start, end).stroke({
      color: 0xf3eee2,
      width: 4,
      alpha: 0.28 + progress * 0.5
    });
    this.protectionRing.arc(0, 36, 43, start, end).stroke({
      color: 0xd43821,
      width: 2,
      alpha: 0.28 + progress * 0.42
    });
  }

  private syncBow(pose: ReturnType<Combatant["createPose"]>, chargeRatio: number): void {
    const facing = { x: Math.cos(this.state.facing), y: Math.sin(this.state.facing) };
    const side = { x: -facing.y, y: facing.x };
    const center = pose.bowGrip;
    const hasBowArm = this.state.limbs.rightArm !== "severed" || this.state.limbs.leftArm !== "severed";
    if (!hasBowArm) {
      return;
    }
    const easedCharge = 1 - Math.pow(1 - clamp(chargeRatio, 0, 1), 3);
    const dynamicBackOffset = bowTipBackOffset + easedCharge * 8;
    const dynamicSideOffset = bowTipSideOffset - easedCharge * 1.8;

    const top = {
      x: center.x - side.x * dynamicSideOffset - facing.x * dynamicBackOffset,
      y: center.y - side.y * dynamicSideOffset - facing.y * dynamicBackOffset
    };
    const bottom = {
      x: center.x + side.x * dynamicSideOffset - facing.x * dynamicBackOffset,
      y: center.y + side.y * dynamicSideOffset - facing.y * dynamicBackOffset
    };
    const belly = {
      x: center.x + facing.x * (4 + easedCharge * 2.2),
      y: center.y + facing.y * (4 + easedCharge * 2.2)
    };
    drawQuadraticArc(this.bowBody, top, belly, bottom, 14).stroke({
      color: 0xf5e4b6,
      width: 3.1,
      cap: "round",
      join: "round"
    });
    this.bowBody.circle(center.x, center.y, 2.8).fill(0xd43821);
    this.bowBody.circle(top.x, top.y, 1.8).fill(0xd43821);
    this.bowBody.circle(bottom.x, bottom.y, 1.8).fill(0xd43821);

    const pull = pose.leftHand;
    this.bowString
      .moveTo(top.x, top.y)
      .lineTo(pull.x, pull.y)
      .lineTo(bottom.x, bottom.y)
      .stroke({ color: 0xf4ead5, width: 1.6 + chargeRatio * 0.5, alpha: chargeRatio > 0 ? 0.95 : 0.72 });

    const arrow = this.getLoadedArrow(pose, chargeRatio);
    const arrowAlpha = 0.48 + chargeRatio * 0.5;
    this.bowString
      .moveTo(arrow.tail.x, arrow.tail.y)
      .lineTo(arrow.tip.x, arrow.tip.y)
      .stroke({ color: 0xfff0c8, width: 1.45 + chargeRatio * 0.35, alpha: arrowAlpha });
    this.bowString
      .moveTo(arrow.tip.x, arrow.tip.y)
      .lineTo(arrow.headLeft.x, arrow.headLeft.y)
      .lineTo(arrow.headRight.x, arrow.headRight.y)
      .closePath()
      .fill({ color: 0xd43821, alpha: 0.52 + chargeRatio * 0.43 });
    this.bowString.circle(arrow.tail.x, arrow.tail.y, 1.6 + chargeRatio * 0.8).fill({
      color: 0xd43821,
      alpha: 0.62 + chargeRatio * 0.33
    });
    this.bowString
      .moveTo(arrow.tail.x, arrow.tail.y)
      .lineTo(arrow.featherLeft.x, arrow.featherLeft.y)
      .moveTo(arrow.tail.x, arrow.tail.y)
      .lineTo(arrow.featherRight.x, arrow.featherRight.y)
      .stroke({ color: 0xf5e4b6, width: 1.05, alpha: 0.72 });
  }

  private getLoadedArrow(pose: ReturnType<Combatant["createPose"]>, chargeRatio: number): LoadedArrow {
    const facing = { x: Math.cos(this.state.facing), y: Math.sin(this.state.facing) };
    const side = { x: -facing.y, y: facing.x };
    const easedCharge = 1 - Math.pow(1 - clamp(chargeRatio, 0, 1), 3);
    const tail = {
      x: pose.leftHand.x + facing.x * 1.5,
      y: pose.leftHand.y + facing.y * 1.5
    };
    const arrowLength = 58 - easedCharge * 4;
    const tip = {
      x: tail.x + facing.x * arrowLength,
      y: tail.y + facing.y * arrowLength
    };
    return {
      tail,
      tip,
      center: {
        x: (tail.x + tip.x) / 2,
        y: (tail.y + tip.y) / 2
      },
      headLeft: { x: tip.x - facing.x * 6 + side.x * 3, y: tip.y - facing.y * 6 + side.y * 3 },
      headRight: { x: tip.x - facing.x * 6 - side.x * 3, y: tip.y - facing.y * 6 - side.y * 3 },
      featherLeft: { x: tail.x - facing.x * 5 + side.x * 2.2, y: tail.y - facing.y * 5 + side.y * 2.2 },
      featherRight: { x: tail.x - facing.x * 5 - side.x * 2.2, y: tail.y - facing.y * 5 - side.y * 2.2 }
    };
  }

  private createPose(chargeRatio: number) {
    const facing = { x: Math.cos(this.state.facing), y: Math.sin(this.state.facing) };
    const side = { x: -facing.y, y: facing.x };
    const easedCharge = 1 - Math.pow(1 - clamp(chargeRatio, 0, 1), 3);
    const draw = this.shotTimer > 0 ? -5 : easedCharge * 38;
    const recoil = this.shotTimer > 0 ? -8 : 0;
    const step = this.state.isRolling ? 10 : Math.sin(performance.now() / 90) * (Math.abs(this.state.velocity.x) + Math.abs(this.state.velocity.y) > 10 ? 4 : 0);
    const shoulder = { x: 0, y: 16 };
    const hip = { x: 0, y: 40 };
    const leftShoulder = { x: shoulder.x - side.x * 9 - facing.x * 2, y: shoulder.y - side.y * 9 - facing.y * 2 };
    const rightShoulder = { x: shoulder.x + side.x * 9 - facing.x * 2, y: shoulder.y + side.y * 9 - facing.y * 2 };
    const bowReach = 27 + easedCharge * 4 + recoil;
    const bowGrip = {
      x: shoulder.x + facing.x * bowReach + side.x * 2,
      y: shoulder.y + facing.y * bowReach + side.y * 2
    };
    const restingStringHand = {
      x: bowGrip.x - facing.x * bowTipBackOffset,
      y: bowGrip.y - facing.y * bowTipBackOffset
    };
    const pullHand = {
      x: restingStringHand.x - facing.x * draw,
      y: restingStringHand.y - facing.y * draw
    };
    const frontElbow = bendPoint(rightShoulder, bowGrip, side, 3 + easedCharge * 3);
    const drawElbow = bendPoint(leftShoulder, pullHand, side, -4 - easedCharge * 3);
    return {
      head: { x: 0, y: 0 },
      neck: { x: shoulder.x, y: shoulder.y },
      hip,
      bowGrip,
      leftShoulder,
      rightShoulder,
      leftElbow: drawElbow,
      leftHand: pullHand,
      rightElbow: frontElbow,
      rightHand: bowGrip,
      leftHip: { x: hip.x - 7, y: hip.y },
      rightHip: { x: hip.x + 7, y: hip.y },
      leftKnee: { x: -13 - side.x * step, y: 57 - side.y * step },
      rightKnee: { x: 13 + side.x * step, y: 57 + side.y * step },
      leftFoot: { x: -18 - side.x * step, y: 76 - side.y * step },
      rightFoot: { x: 18 + side.x * step, y: 76 + side.y * step }
    };
  }
}

const distanceToSegment = (point: Vec2, a: Vec2, b: Vec2): number => {
  const segment = { x: b.x - a.x, y: b.y - a.y };
  const lengthSquared = segment.x * segment.x + segment.y * segment.y;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }
  const t = clamp(((point.x - a.x) * segment.x + (point.y - a.y) * segment.y) / lengthSquared, 0, 1);
  const projection = { x: a.x + segment.x * t, y: a.y + segment.y * t };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
};

const bendPoint = (a: Vec2, b: Vec2, side: Vec2, amount: number): Vec2 => {
  return {
    x: (a.x + b.x) / 2 + side.x * amount,
    y: (a.y + b.y) / 2 + side.y * amount
  };
};

const resolveSolidZones = (position: Vec2, zones: SolidZone[], radius: number): void => {
  for (const zone of zones) {
    const nearest = {
      x: clamp(position.x, zone.x, zone.x + zone.width),
      y: clamp(position.y, zone.y, zone.y + zone.height)
    };
    const delta = { x: position.x - nearest.x, y: position.y - nearest.y };
    const distance = Math.hypot(delta.x, delta.y);
    if (distance >= radius) {
      continue;
    }
    if (distance > 0) {
      const push = radius - distance;
      position.x += (delta.x / distance) * push;
      position.y += (delta.y / distance) * push;
      continue;
    }

    const sides = [
      { axis: "x", amount: zone.x - position.x - radius },
      { axis: "x", amount: zone.x + zone.width - position.x + radius },
      { axis: "y", amount: zone.y - position.y - radius },
      { axis: "y", amount: zone.y + zone.height - position.y + radius }
    ] as const;
    const nearestSide = sides.reduce((best, side) =>
      Math.abs(side.amount) < Math.abs(best.amount) ? side : best
    );
    position[nearestSide.axis] += nearestSide.amount;
  }
};

const drawQuadraticArc = (graphics: Graphics, start: Vec2, control: Vec2, end: Vec2, segments: number): Graphics => {
  graphics.moveTo(start.x, start.y);
  for (let index = 1; index <= segments; index += 1) {
    const t = index / segments;
    const inverse = 1 - t;
    graphics.lineTo(
      inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
    );
  }
  return graphics;
};
