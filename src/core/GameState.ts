/**
 * Game State Machine States for BOUNCE
 */
export enum GameStateEnum {
  TITLE = 'TITLE',
  CINEMATIC_INTRO = 'CINEMATIC_INTRO',
  COUNTDOWN = 'COUNTDOWN',
  PLAYING = 'PLAYING',
  DYING = 'DYING',
  VICTORY = 'VICTORY',
  RESULTS = 'RESULTS',
}

export class GameStateManager {
  private currentState: GameStateEnum = GameStateEnum.TITLE;
  private stateTime: number = 0;
  private onStateChangeCallback?: (state: GameStateEnum) => void;

  constructor(initialState: GameStateEnum = GameStateEnum.TITLE) {
    this.currentState = initialState;
  }

  public getState(): GameStateEnum {
    return this.currentState;
  }

  public getStateTime(): number {
    return this.stateTime;
  }

  public setState(newState: GameStateEnum): void {
    if (this.currentState === newState) return;
    this.currentState = newState;
    this.stateTime = 0;
    if (this.onStateChangeCallback) {
      this.onStateChangeCallback(newState);
    }
  }

  public setOnStateChange(cb: (state: GameStateEnum) => void): void {
    this.onStateChangeCallback = cb;
  }

  public update(delta: number): void {
    this.stateTime += delta;
  }
}
