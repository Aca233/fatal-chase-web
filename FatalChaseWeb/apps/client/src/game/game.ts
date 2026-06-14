import { Application, Container, Graphics, Text } from "pixi.js";
import Matter from "matter-js";
import type { InputCommand, LimbKey, Vec2 } from "@fatal-chase/shared";
import { normalize } from "@fatal-chase/shared";
import { Combatant } from "./combatant";
import { ImpactEffect } from "./impact-effect";
import { Projectile } from "./projectile";
import { Hud, type TraumaNotice } from "../ui/hud";
import { InputController } from "../input/input-controller";
import { SettlementOverlay } from "../ui/settlement";

const arena = { width: 1600, height: 900 };
const matchDurationSeconds = 60;
const respawnProtectionSeconds = 2;

type RectZone = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type WoodBox = RectZone & {
  hp: number;
};

type MatchStats = {
  shots: number;
  hits: number;
  severed: number;
  fatalHits: number;
  boxesDestroyed: number;
  fakeCancels: number;
};

type AiBrain = {
  chargeSeconds: number;
  fireCooldown: number;
  phase: number;
};

const blackWalls: RectZone[] = [
  { x: 210, y: 160, width: 220, height: 38 },
  { x: 1120, y: 620, width: 260, height: 38 }
];

const grassZones: RectZone[] = [{ x: 1030, y: 168, width: 300, height: 164 }];
const mudZones: RectZone[] = [{ x: 360, y: 608, width: 340, height: 184 }];

export class Game {
  private readonly stage = new Container();
  private readonly world = new Container();
  private readonly map = new Graphics();
  private readonly mapLabel = new Text({
    text: "M1 LOCAL ARENA",
    style: { fill: 0x8f8170, fontFamily: "Arial Narrow", fontSize: 18 }
  });
  private readonly compass = new Graphics();
  private readonly dangerPing = new Graphics();
  private readonly player = new Combatant("p1", "你", { x: 420, y: 420 }, "p2");
  private readonly target = new Combatant("p2", "靶子", { x: 1040, y: 430 }, "p3");
  private readonly rival = new Combatant("p3", "游荡者", { x: 1220, y: 650 }, "p1");
  private readonly enemies = [this.target, this.rival];
  private readonly aiBrains = new Map<string, AiBrain>();
  private readonly projectiles: Projectile[] = [];
  private readonly effects: ImpactEffect[] = [];
  private readonly boxes: WoodBox[] = [{ x: 710, y: 245, width: 86, height: 86, hp: 3 }];
  private readonly events: string[] = ["目标锁定：靶子"];
  private readonly input: InputController;
  private readonly hud: Hud;
  private readonly settlement: SettlementOverlay;
  private readonly engine = Matter.Engine.create();
  private chargeSeconds = 0;
  private currentTargetIndex = 0;
  private matchSecondsRemaining = matchDurationSeconds;
  private matchEnded = false;
  private terrainLabel = "干地";
  private traumaNotice: TraumaNotice | null = null;
  private traumaTimer = 0;
  private stats: MatchStats = this.createStats();

  constructor(private readonly app: Application, host: HTMLElement) {
    this.input = new InputController(app.canvas);
    this.hud = new Hud(host);
    this.settlement = new SettlementOverlay(host, () => this.restartMatch());
    this.engine.gravity.scale = 0;
    this.stage.addChild(this.world);
    this.world.addChild(
      this.map,
      this.mapLabel,
      this.target.view,
      this.rival.view,
      this.player.view,
      this.compass,
      this.dangerPing
    );
    this.app.stage.addChild(this.stage);
    this.resetAiBrains();
    this.syncHuntTargets();
    this.player.protect(respawnProtectionSeconds);
    this.drawMap();
    this.addDebugBodies();
  }

  start(): void {
    this.app.ticker.add((ticker) => this.update(Math.min(ticker.deltaMS / 1000, 0.05)));
  }

  private update(deltaSeconds: number): void {
    if (this.matchEnded) {
      this.hud.update(
        this.player.state,
        0,
        this.terrainLabel,
        this.events,
        this.matchSecondsRemaining,
        this.currentTarget.state.name,
        this.traumaNotice
      );
      return;
    }
    this.matchSecondsRemaining = Math.max(0, this.matchSecondsRemaining - deltaSeconds);
    const command = this.withWorldAim(this.input.read());
    this.updateCharge(command, deltaSeconds);
    const playerTerrain = this.getTerrainAt(this.player.state.position);
    this.updateTerrainLabel(playerTerrain.label);
    this.player.update(command, deltaSeconds, arena, { ...playerTerrain, solidZones: this.getSolidZones() }, this.getChargeRatio());
    this.animateEnemies(deltaSeconds);
    this.updateProjectiles(deltaSeconds);
    this.updateEffects(deltaSeconds);
    this.updateTrauma(deltaSeconds);
    this.updateCamera();
    this.drawCompass();
    this.drawDangerPing();
    this.hud.update(
      this.player.state,
      this.getChargeRatio(),
      this.terrainLabel,
      this.events,
      this.matchSecondsRemaining,
      this.currentTarget.state.name,
      this.traumaNotice
    );
    Matter.Engine.update(this.engine, Math.min(deltaSeconds * 1000, 16));
    if (this.matchSecondsRemaining === 0) {
      this.endMatch();
    }
  }

  private withWorldAim(command: InputCommand): InputCommand {
    const scale = this.stage.scale.x || 1;
    return {
      ...command,
      aim: {
        x: (command.aim.x - this.stage.position.x) / scale,
        y: (command.aim.y - this.stage.position.y) / scale
      }
    };
  }

  private updateCharge(command: InputCommand, deltaSeconds: number): void {
    if (command.cancelCharge) {
      this.chargeSeconds = 0;
      this.stats.fakeCancels += 1;
      this.pushEvent("假动作取消：没有箭矢生成");
      return;
    }
    if (command.charging || command.fire) {
      this.player.clearProtection();
    }
    if (command.charging) {
      this.chargeSeconds = Math.min(1.25, this.chargeSeconds + deltaSeconds * this.player.getChargeMultiplier());
    }
    if (command.fire) {
      this.fireArrow(this.player, this.currentTarget.state.id, command.aim, this.getChargeRatio(), true);
      this.chargeSeconds = 0;
    }
  }

  private fireArrow(shooter: Combatant, targetId: string, aim: Vec2, chargeRatio: number, countStats: boolean): void {
    if (shooter.getChargeMultiplier() === 0) {
      this.pushEvent(`${shooter.state.name}双臂断裂：无法拉弓`);
      return;
    }
    const power = Math.max(0.25, chargeRatio);
    shooter.faceToward(aim);
    const direction = { x: Math.cos(shooter.state.facing), y: Math.sin(shooter.state.facing) };
    const start = shooter.getLoadedArrowWorldPosition(chargeRatio);
    const arrow = new Projectile(start, direction, 520 + power * 460, shooter.state.id, targetId);
    if (countStats) {
      this.stats.shots += 1;
    }
    shooter.playShot();
    this.projectiles.push(arrow);
    this.world.addChild(arrow.view);
  }

  private getChargeRatio(): number {
    return Math.min(1, this.chargeSeconds / 1.25);
  }

  private updateProjectiles(deltaSeconds: number): void {
    for (const projectile of [...this.projectiles]) {
      projectile.update(deltaSeconds);
      const box = this.findHitBox(projectile.position);
      if (box) {
        this.resolveBoxHit(projectile, box);
      } else if (this.isInAnyRect(projectile.position, blackWalls)) {
        this.removeProjectile(projectile);
        this.pushEvent("箭矢撞上合金黑墙");
      } else if (this.tryParryProjectile(projectile)) {
        continue;
      } else {
        const target = this.findCombatant(projectile.targetId);
        if (target?.getHitLimb(projectile.position)) {
          this.resolveCombatantHit(projectile, target);
        }
      }
      if (projectile.isExpired(arena)) {
        this.removeProjectile(projectile);
      }
    }
  }

  private tryParryProjectile(projectile: Projectile): boolean {
    if (
      this.player.state.parrySeconds <= 0 ||
      projectile.ownerId === this.player.state.id ||
      projectile.targetId !== this.player.state.id
    ) {
      return false;
    }
    const toPlayer = {
      x: this.player.state.position.x - projectile.position.x,
      y: this.player.state.position.y - projectile.position.y
    };
    const forwardDistance = toPlayer.x * projectile.direction.x + toPlayer.y * projectile.direction.y;
    const distance = Math.hypot(toPlayer.x, toPlayer.y);
    if (distance > 64 || forwardDistance < -10) {
      return false;
    }
    this.removeProjectile(projectile);
    this.addImpactEffect(projectile.position, projectile.direction, "leftArm", false, false);
    this.pushEvent("空手截箭：没有断肢，冷却开始");
    this.showTrauma("截箭成功", "E 的短窗口吃掉一支来箭；双臂断裂时不可用", "success");
    return true;
  }

  private resolveCombatantHit(projectile: Projectile, target: Combatant): void {
    const hitPoint = { ...projectile.position };
    const hitDirection = projectile.direction;
    const playerOwned = projectile.ownerId === this.player.state.id;
    const shooter = this.findCombatant(projectile.ownerId);
    this.removeProjectile(projectile);
    const limb = target.getHitLimb(hitPoint);
    if (!limb) {
      this.pushEvent("箭矢擦过：未命中有效部位");
      return;
    }
    if (target.state.isRolling) {
      this.addImpactEffect(hitPoint, hitDirection, limb, false, false);
      this.pushEvent(target === this.player ? "翻滚闪避：箭矢擦身" : `${target.state.name}翻滚避箭`);
      this.showTrauma("擦箭闪避", "翻滚窗口抵消本次断肢和击杀", "neutral");
      return;
    }
    if (target.state.protectionSeconds > 0) {
      this.addImpactEffect(hitPoint, hitDirection, limb, false, false);
      this.pushEvent(target === this.player ? "复活保护：箭矢弹开" : `${target.state.name}受保护：箭矢弹开`);
      this.showTrauma("复活保护", "保护中不会断肢或死亡；主动拉弓会立刻解除", "neutral");
      return;
    }
    if (playerOwned) {
      this.stats.hits += 1;
    }
    if (limb === "head" || limb === "torso") {
      if (playerOwned) {
        this.stats.fatalHits += 1;
        if (target === this.currentTarget) {
          this.player.state.score += 1;
        }
      }
      this.addImpactEffect(hitPoint, hitDirection, limb, false, true);
      this.pushEvent(this.formatFatalEvent(playerOwned, target, limb));
      this.showTrauma(
        `${playerOwned ? "致命命中" : "致命受击"}：${this.labelLimb(limb)}`,
        "头部/躯干命中直接出局，追击链立即重组",
        playerOwned ? "success" : "danger"
      );
      if (target === this.player) {
        this.respawnPlayer();
      } else {
        this.handleEnemyDown(target, shooter);
      }
      return;
    }
    if (target.state.limbs[limb] === "severed") {
      this.addImpactEffect(hitPoint, hitDirection, limb, false, false);
      this.pushEvent(`${playerOwned ? "命中" : "被命中"}残缺部位：${this.labelLimb(limb)}`);
      this.showTrauma("残缺部位被击中", "该部位已经失去功能，本次不追加惩罚", "neutral");
      return;
    }
    target.sever(limb);
    if (playerOwned) {
      this.stats.severed += 1;
    }
    this.addImpactEffect(hitPoint, hitDirection, limb, true, false);
    this.pushEvent(`${playerOwned ? "命中目标" : "你被命中"}：${this.labelLimb(limb)} 断裂`);
    this.showTrauma(
      `${playerOwned ? "断肢命中" : "肢体损失"}：${this.labelLimb(limb)}`,
      this.describeLimbEffect(target, limb),
      playerOwned ? "success" : "danger"
    );
    if (target !== this.player && this.isExecuted(target)) {
      if (playerOwned && target === this.currentTarget) {
        this.player.state.score += 1;
        this.stats.fatalHits += 1;
        this.pushEvent("追击完成：碎肉分 +1，新目标重组");
      }
      this.handleEnemyDown(target, shooter);
    }
  }

  private resolveBoxHit(projectile: Projectile, box: WoodBox): void {
    this.removeProjectile(projectile);
    box.hp -= 1;
    if (box.hp <= 0) {
      const index = this.boxes.indexOf(box);
      this.boxes.splice(index, 1);
      if (projectile.ownerId === this.player.state.id) {
        this.stats.boxesDestroyed += 1;
      }
      this.drawMap();
      this.pushEvent("木箱爆裂：掩体消失");
      this.showTrauma("掩体破坏", "木箱移除后不再阻挡箭矢和移动", "neutral");
      return;
    }
    this.drawMap();
    this.pushEvent(`木箱受损：${box.hp}/3`);
    this.showTrauma("掩体受损", `还需 ${box.hp} 次命中即可破坏`, "neutral");
  }

  private removeProjectile(projectile: Projectile): void {
    const index = this.projectiles.indexOf(projectile);
    if (index >= 0) {
      this.projectiles.splice(index, 1);
    }
    projectile.view.destroy();
  }

  private addImpactEffect(position: Vec2, direction: Vec2, limb: LimbKey, severed: boolean, fatal: boolean): void {
    const effect = new ImpactEffect({ position, direction, limb, severed, fatal });
    this.effects.push(effect);
    this.world.addChild(effect.view);
  }

  private updateEffects(deltaSeconds: number): void {
    for (const effect of [...this.effects]) {
      if (!effect.update(deltaSeconds)) {
        continue;
      }
      const index = this.effects.indexOf(effect);
      if (index >= 0) {
        this.effects.splice(index, 1);
      }
      effect.view.destroy({ children: true });
    }
  }

  private endMatch(): void {
    this.matchEnded = true;
    this.chargeSeconds = 0;
    this.pushEvent("本局结束：战报生成");
    this.settlement.show({
      score: this.player.state.score,
      ...this.stats,
      events: this.events
    });
  }

  private restartMatch(): void {
    this.clearTransientObjects();
    this.player.reset({ x: 420, y: 420 });
    this.player.state.score = 0;
    this.player.protect(respawnProtectionSeconds);
    this.target.reset({ x: 1040, y: 430 });
    this.rival.reset({ x: 1220, y: 650 });
    this.boxes.splice(0, this.boxes.length, { x: 710, y: 245, width: 86, height: 86, hp: 3 });
    this.events.splice(0, this.events.length, "目标锁定：靶子");
    this.stats = this.createStats();
    this.chargeSeconds = 0;
    this.currentTargetIndex = 0;
    this.resetAiBrains();
    this.syncHuntTargets();
    this.matchSecondsRemaining = matchDurationSeconds;
    this.matchEnded = false;
    this.terrainLabel = "干地";
    this.traumaNotice = null;
    this.traumaTimer = 0;
    this.drawMap();
    this.settlement.hide();
  }

  private clearTransientObjects(): void {
    for (const projectile of [...this.projectiles]) {
      this.removeProjectile(projectile);
    }
    for (const effect of [...this.effects]) {
      const index = this.effects.indexOf(effect);
      if (index >= 0) {
        this.effects.splice(index, 1);
      }
      effect.view.destroy({ children: true });
    }
  }

  private createStats(): MatchStats {
    return {
      shots: 0,
      hits: 0,
      severed: 0,
      fatalHits: 0,
      boxesDestroyed: 0,
      fakeCancels: 0
    };
  }

  private get currentTarget(): Combatant {
    return this.enemies[this.currentTargetIndex] ?? this.enemies[0];
  }

  private resetAiBrains(): void {
    this.aiBrains.clear();
    for (const [index, enemy] of this.enemies.entries()) {
      this.aiBrains.set(enemy.state.id, {
        chargeSeconds: 0,
        fireCooldown: 1.1 + index * 0.6,
        phase: index * 1.7
      });
    }
  }

  private syncHuntTargets(): void {
    this.player.state.targetId = this.currentTarget.state.id;
    this.target.state.targetId = this.rival.state.id;
    this.rival.state.targetId = this.player.state.id;
  }

  private isExecuted(combatant: Combatant): boolean {
    const limbs = combatant.state.limbs;
    return (
      limbs.leftArm === "severed" &&
      limbs.rightArm === "severed" &&
      limbs.leftLeg === "severed" &&
      limbs.rightLeg === "severed"
    );
  }

  private handleEnemyDown(enemy: Combatant, killer: Combatant | null): void {
    const wasPlayerTarget = enemy === this.currentTarget;
    if (!killer || killer === this.player || wasPlayerTarget) {
      this.advancePlayerTarget();
    } else if (this.enemies.includes(killer)) {
      this.currentTargetIndex = this.enemies.indexOf(killer);
      this.pushEvent(`目标被第三方击杀：改追 ${killer.state.name}`);
    }
    this.respawnEnemy(enemy);
    this.syncHuntTargets();
  }

  private advancePlayerTarget(): void {
    this.currentTargetIndex = (this.currentTargetIndex + 1) % this.enemies.length;
    this.pushEvent(`目标转移：${this.currentTarget.state.name}`);
  }

  private respawnEnemy(enemy: Combatant): void {
    const nextPosition = this.findRespawnPosition(enemy);
    enemy.reset(nextPosition);
    enemy.protect(respawnProtectionSeconds);
    const brain = this.aiBrains.get(enemy.state.id);
    if (brain) {
      brain.chargeSeconds = 0;
      brain.fireCooldown = 1.2 + Math.random() * 0.8;
    }
  }

  private respawnPlayer(): void {
    this.player.reset({ x: 420, y: 420 });
    this.player.protect(respawnProtectionSeconds);
    this.chargeSeconds = 0;
    for (const brain of this.aiBrains.values()) {
      brain.chargeSeconds = 0;
      brain.fireCooldown = 1.4 + Math.random() * 0.8;
    }
  }

  private findCombatant(id: string): Combatant | null {
    if (id === this.player.state.id) {
      return this.player;
    }
    return this.enemies.find((enemy) => enemy.state.id === id) ?? null;
  }

  private findRespawnPosition(enemy: Combatant): Vec2 {
    const away = normalize({
      x: enemy.state.position.x - this.player.state.position.x,
      y: enemy.state.position.y - this.player.state.position.y
    });
    const spread = this.enemies.indexOf(enemy) * 170;
    return {
      x: Math.min(Math.max(this.player.state.position.x + away.x * 520 + spread, 180), arena.width - 180),
      y: Math.min(Math.max(this.player.state.position.y + away.y * 360 - spread * 0.45, 160), arena.height - 160)
    };
  }

  private formatFatalEvent(playerOwned: boolean, target: Combatant, limb: LimbKey): string {
    if (!playerOwned) {
      return target === this.player ? `你被射穿：${this.labelLimb(limb)}` : `${target.state.name}被射穿`;
    }
    return target === this.currentTarget ? "致命命中：碎肉分 +1" : `误杀 ${target.state.name}：无分`;
  }

  private describeLimbEffect(target: Combatant, limb: LimbKey): string {
    if (limb === "leftArm" || limb === "rightArm") {
      if (target.getChargeMultiplier() === 0) {
        return "双臂断裂：无法拉弓，只能移动和翻滚";
      }
      return "单臂断裂：蓄力速度降低，拉弓窗口变长";
    }
    if (limb === "leftLeg" || limb === "rightLeg") {
      const limbs = target.state.limbs;
      if (limbs.leftLeg === "severed" && limbs.rightLeg === "severed") {
        return "双腿断裂：进入爬行，无法翻滚";
      }
      return "单腿断裂：移动速度下降，翻滚距离变短";
    }
    return "有效部位受创";
  }

  private showTrauma(title: string, detail: string, tone: TraumaNotice["tone"]): void {
    this.traumaNotice = { title, detail, tone };
    this.traumaTimer = 2.4;
  }

  private updateTrauma(deltaSeconds: number): void {
    if (!this.traumaNotice) {
      return;
    }
    this.traumaTimer = Math.max(0, this.traumaTimer - deltaSeconds);
    if (this.traumaTimer === 0) {
      this.traumaNotice = null;
    }
  }

  private labelLimb(limb: LimbKey): string {
    const labels: Record<LimbKey, string> = {
      head: "头部",
      torso: "躯干",
      leftArm: "左臂",
      rightArm: "右臂",
      leftLeg: "左腿",
      rightLeg: "右腿"
    };
    return labels[limb];
  }

  private pushEvent(text: string): void {
    if (this.events[this.events.length - 1] !== text) {
      this.events.push(text);
    }
  }

  private getTerrainAt(position: Vec2): { speedMultiplier: number; concealed: boolean; label: string } {
    if (this.isInAnyRect(position, grassZones)) {
      return { speedMultiplier: 1, concealed: true, label: "草丛隐身" };
    }
    if (this.isInAnyRect(position, mudZones)) {
      return { speedMultiplier: 0.55, concealed: false, label: "泥沼减速" };
    }
    return { speedMultiplier: 1, concealed: false, label: "干地" };
  }

  private updateTerrainLabel(label: string): void {
    if (this.terrainLabel === label) {
      return;
    }
    this.terrainLabel = label;
    if (label !== "干地") {
      this.pushEvent(label);
    }
  }

  private animateEnemies(deltaSeconds: number): void {
    const t = performance.now() / 1000;
    for (const [index, enemy] of this.enemies.entries()) {
      const brain = this.aiBrains.get(enemy.state.id);
      const intendedTarget = this.findCombatant(enemy.state.targetId);
      if (!brain || !intendedTarget) {
        continue;
      }

      brain.fireCooldown = Math.max(0, brain.fireCooldown - deltaSeconds);
      const toTarget = {
        x: intendedTarget.state.position.x - enemy.state.position.x,
        y: intendedTarget.state.position.y - enemy.state.position.y
      };
      const distance = Math.hypot(toTarget.x, toTarget.y);
      const direction = normalize(toTarget);
      const side = { x: -direction.y, y: direction.x };
      const rangeMove = distance > 520 ? 0.72 : distance < 260 ? -0.5 : 0.12;
      const strafe = Math.sin(t * 0.85 + brain.phase) * 0.68;
      const aim = {
        x: intendedTarget.state.position.x + intendedTarget.state.velocity.x * 0.2,
        y: intendedTarget.state.position.y + intendedTarget.state.velocity.y * 0.2
      };
      const canShoot = distance < 820 && brain.fireCooldown === 0 && enemy.getChargeMultiplier() > 0;
      if (canShoot) {
        brain.chargeSeconds = Math.min(1.25, brain.chargeSeconds + deltaSeconds * enemy.getChargeMultiplier());
      } else {
        brain.chargeSeconds = Math.max(0, brain.chargeSeconds - deltaSeconds * 0.9);
      }

      const chargeRatio = Math.min(1, brain.chargeSeconds / 1.25);
      const shouldFire = chargeRatio >= 0.72 && canShoot;
      const command = {
        move: normalize({
          x: direction.x * rangeMove + side.x * strafe,
          y: direction.y * rangeMove + side.y * strafe
        }),
        aim,
        charging: canShoot && !shouldFire,
        fire: shouldFire,
        cancelCharge: false,
        roll: false,
        parry: false
      };
      const terrain = this.getTerrainAt(enemy.state.position);
      enemy.update(command, deltaSeconds, arena, { ...terrain, solidZones: this.getSolidZones() }, command.charging ? chargeRatio : 0);
      if (command.charging || command.fire) {
        enemy.clearProtection();
      }
      if (shouldFire) {
        this.fireArrow(enemy, intendedTarget.state.id, aim, chargeRatio, false);
        brain.chargeSeconds = 0;
        brain.fireCooldown = 1.45 + Math.random() * 0.75 + index * 0.15;
        this.pushEvent(
          intendedTarget === this.player
            ? `${enemy.state.name}放箭：注意翻滚窗口`
            : `${enemy.state.name}追射${intendedTarget.state.name}`
        );
      }
    }
  }

  private drawMap(): void {
    this.map.clear();
    this.map.rect(0, 0, arena.width, arena.height).fill(0x23201d);
    this.map.rect(0, 0, arena.width, arena.height).stroke({ color: 0x5c5148, width: 4 });
    for (const wall of blackWalls) {
      this.map.rect(wall.x, wall.y, wall.width, wall.height).fill(0x11100f);
    }
    for (const box of this.boxes) {
      this.map
        .rect(box.x, box.y, box.width, box.height)
        .fill(0x8f5b31)
        .stroke({ color: box.hp === 1 ? 0xd43821 : 0xd09b61, width: 2 });
      this.map.moveTo(box.x + 12, box.y + 14).lineTo(box.x + box.width - 10, box.y + box.height - 12).stroke({
        color: 0x51311c,
        width: 2,
        alpha: 0.55
      });
    }
    for (const grass of grassZones) {
      this.map.ellipse(grass.x + grass.width / 2, grass.y + grass.height / 2, grass.width / 2, grass.height / 2).fill({
        color: 0x314d2b,
        alpha: 0.72
      });
    }
    for (const mud of mudZones) {
      this.map.ellipse(mud.x + mud.width / 2, mud.y + mud.height / 2, mud.width / 2, mud.height / 2).fill({
        color: 0x5a4932,
        alpha: 0.82
      });
    }

    this.mapLabel.position.set(28, 28);
  }

  private drawCompass(): void {
    const dx = this.currentTarget.state.position.x - this.player.state.position.x;
    const dy = this.currentTarget.state.position.y - this.player.state.position.y;
    const angle = Math.atan2(dy, dx);
    this.compass.clear();
    this.compass.position.set(this.player.state.position.x, this.player.state.position.y + 76);
    this.compass.rotation = angle;
    this.compass
      .moveTo(20, 0)
      .lineTo(50, -8)
      .lineTo(50, 8)
      .closePath()
      .fill(0xd43821);
  }

  private drawDangerPing(): void {
    const threat = this.findIncomingThreat();
    this.dangerPing.clear();
    if (!threat) {
      return;
    }

    const pulse = 0.65 + Math.sin(performance.now() / 72) * 0.25;
    const angle = Math.atan2(threat.from.y, threat.from.x);
    this.dangerPing.position.set(this.player.state.position.x, this.player.state.position.y);
    this.dangerPing.rotation = angle;
    this.dangerPing
      .moveTo(-58, -24)
      .lineTo(-86, 0)
      .lineTo(-58, 24)
      .lineTo(-66, 8)
      .lineTo(-118, 8)
      .lineTo(-118, -8)
      .lineTo(-66, -8)
      .closePath()
      .fill({ color: 0xd43821, alpha: 0.25 + threat.urgency * 0.35 * pulse });
    this.dangerPing
      .moveTo(-44, -35)
      .lineTo(-24, -35)
      .moveTo(-44, 35)
      .lineTo(-24, 35)
      .stroke({ color: 0xf3eee2, width: 2, alpha: 0.18 + threat.urgency * 0.42 });
    this.dangerPing
      .circle(0, 38, 44 + threat.urgency * 10)
      .stroke({ color: 0xd43821, width: 2, alpha: 0.12 + threat.urgency * 0.26 });
  }

  private findIncomingThreat(): { from: Vec2; urgency: number } | null {
    let best: { from: Vec2; urgency: number } | null = null;
    for (const projectile of this.projectiles) {
      if (projectile.ownerId === this.player.state.id || projectile.targetId !== this.player.state.id) {
        continue;
      }
      const toPlayer = {
        x: this.player.state.position.x - projectile.position.x,
        y: this.player.state.position.y - projectile.position.y
      };
      const forwardDistance = toPlayer.x * projectile.direction.x + toPlayer.y * projectile.direction.y;
      if (forwardDistance <= 0 || forwardDistance > 520) {
        continue;
      }
      const closestPoint = {
        x: projectile.position.x + projectile.direction.x * forwardDistance,
        y: projectile.position.y + projectile.direction.y * forwardDistance
      };
      const missDistance = Math.hypot(
        this.player.state.position.x - closestPoint.x,
        this.player.state.position.y - closestPoint.y
      );
      if (missDistance > 72) {
        continue;
      }
      const urgency = Math.max(0.18, 1 - forwardDistance / 520) * Math.max(0.35, 1 - missDistance / 72);
      if (!best || urgency > best.urgency) {
        best = {
          from: normalize({
            x: projectile.position.x - this.player.state.position.x,
            y: projectile.position.y - this.player.state.position.y
          }),
          urgency
        };
      }
    }
    return best;
  }

  private updateCamera(): void {
    const scale = Math.min(this.app.screen.width / 1120, this.app.screen.height / 720);
    this.stage.scale.set(scale);
    this.stage.position.set(
      this.app.screen.width / 2 - this.player.state.position.x * scale,
      this.app.screen.height / 2 - this.player.state.position.y * scale
    );
  }

  private getSolidZones(): RectZone[] {
    return [...blackWalls, ...this.boxes];
  }

  private addDebugBodies(): void {
    Matter.Composite.add(
      this.engine.world,
      blackWalls.map((wall) =>
        Matter.Bodies.rectangle(wall.x + wall.width / 2, wall.y + wall.height / 2, wall.width, wall.height, {
          isStatic: true
        })
      )
    );
  }

  private findHitBox(position: Vec2): WoodBox | undefined {
    return this.boxes.find((box) => this.isInRect(position, box));
  }

  private isInAnyRect(position: Vec2, zones: RectZone[]): boolean {
    return zones.some((zone) => this.isInRect(position, zone));
  }

  private isInRect(position: Vec2, zone: RectZone): boolean {
    return (
      position.x >= zone.x &&
      position.x <= zone.x + zone.width &&
      position.y >= zone.y &&
      position.y <= zone.y + zone.height
    );
  }
}
