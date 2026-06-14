import { Sprite } from "pixi.js";
import type { Vec2 } from "@fatal-chase/shared";
import { getSvgAssets } from "../assets/svg-assets";

export class Projectile {
  readonly view = new Sprite(getSvgAssets().arrow);
  readonly position: Vec2;
  readonly ownerId: string;
  readonly targetId: string;
  private readonly velocity: Vec2;
  private age = 0;

  constructor(position: Vec2, direction: Vec2, speed: number, ownerId: string, targetId: string) {
    this.position = { ...position };
    this.ownerId = ownerId;
    this.targetId = targetId;
    this.velocity = { x: direction.x * speed, y: direction.y * speed };
    this.view.anchor.set(0.5);
    this.view.scale.set(0.18);
    this.syncView();
  }

  get direction(): Vec2 {
    const length = Math.hypot(this.velocity.x, this.velocity.y) || 1;
    return { x: this.velocity.x / length, y: this.velocity.y / length };
  }

  update(deltaSeconds: number): void {
    this.age += deltaSeconds;
    this.position.x += this.velocity.x * deltaSeconds;
    this.position.y += this.velocity.y * deltaSeconds;
    this.syncView();
  }

  isExpired(arena: { width: number; height: number }): boolean {
    return (
      this.age > 2.4 ||
      this.position.x < -80 ||
      this.position.y < -80 ||
      this.position.x > arena.width + 80 ||
      this.position.y > arena.height + 80
    );
  }

  private syncView(): void {
    const angle = Math.atan2(this.velocity.y, this.velocity.x);
    this.view.position.set(this.position.x, this.position.y);
    this.view.rotation = angle;
  }
}
