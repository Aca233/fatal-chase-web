import { Container, Graphics } from "pixi.js";
import type { LimbKey, Vec2 } from "@fatal-chase/shared";

type Particle = {
  readonly view: Graphics;
  readonly velocity: Vec2;
  readonly spin: number;
};

type ImpactEffectOptions = {
  position: Vec2;
  direction: Vec2;
  limb: LimbKey;
  severed: boolean;
  fatal: boolean;
};

const limbDebrisLength: Partial<Record<LimbKey, number>> = {
  leftArm: 22,
  rightArm: 22,
  leftLeg: 28,
  rightLeg: 28
};

export class ImpactEffect {
  readonly view = new Container();
  private readonly particles: Particle[] = [];
  private age = 0;
  private readonly lifetime: number;

  constructor(options: ImpactEffectOptions) {
    this.view.position.set(options.position.x, options.position.y);
    this.lifetime = options.fatal ? 0.7 : options.severed ? 0.58 : 0.34;
    this.createBurst(options);
    if (options.severed) {
      this.createDebris(options);
    }
  }

  update(deltaSeconds: number): boolean {
    this.age += deltaSeconds;
    const progress = Math.min(1, this.age / this.lifetime);
    this.view.alpha = 1 - progress;
    for (const particle of this.particles) {
      particle.view.position.x += particle.velocity.x * deltaSeconds;
      particle.view.position.y += particle.velocity.y * deltaSeconds;
      particle.view.rotation += particle.spin * deltaSeconds;
    }
    return progress >= 1;
  }

  private createBurst(options: ImpactEffectOptions): void {
    const count = options.fatal ? 18 : options.severed ? 13 : 7;
    const spread = options.fatal ? 1.35 : 0.8;
    const baseAngle = Math.atan2(options.direction.y, options.direction.x);
    for (let index = 0; index < count; index += 1) {
      const angle = baseAngle + (Math.random() - 0.5) * Math.PI * spread + Math.PI;
      const speed = 62 + Math.random() * (options.fatal ? 150 : 105);
      const size = options.fatal ? 2.5 + Math.random() * 4 : 2 + Math.random() * 3;
      const particle = new Graphics();
      particle.circle(0, 0, size).fill(index % 4 === 0 ? 0xf3eee2 : 0xd43821);
      particle.position.set((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      this.view.addChild(particle);
      this.particles.push({
        view: particle,
        velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
        spin: (Math.random() - 0.5) * 10
      });
    }
  }

  private createDebris(options: ImpactEffectOptions): void {
    const length = limbDebrisLength[options.limb];
    if (!length) {
      return;
    }
    const angle = Math.atan2(options.direction.y, options.direction.x) + Math.PI * 0.5;
    const debris = new Graphics();
    debris.moveTo(-length / 2, 0).lineTo(length / 2, 0).stroke({
      color: 0xf3eee2,
      width: options.limb.includes("Leg") ? 7 : 5,
      cap: "round"
    });
    debris.circle(length / 2, 0, 3.8).fill(0xd43821);
    debris.rotation = angle;
    this.view.addChild(debris);
    this.particles.push({
      view: debris,
      velocity: {
        x: -options.direction.x * 110 + (Math.random() - 0.5) * 55,
        y: -options.direction.y * 110 + (Math.random() - 0.5) * 55
      },
      spin: (Math.random() - 0.5) * 8
    });
  }
}
