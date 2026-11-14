export interface ScrollPos {
  readonly left: number;
  readonly top: number;
}

/**
 * Singleton: una única instancia en toda la app que recuerda, por pantalla, la posición del scroll
 * y los valores que la persona dejó. Al volver a la misma pestaña se leen de aquí y todo sigue como estaba.
 *
 * Vive mientras la pestaña del navegador esté abierta (no se escribe en localStorage a propósito).
 */
export class ViewMemory {
  private static instance: ViewMemory | null = null;

  static getInstance(): ViewMemory {
    if (ViewMemory.instance === null) ViewMemory.instance = new ViewMemory();
    return ViewMemory.instance;
  }

  private readonly scroll = new Map<string, ScrollPos>();
  private readonly values = new Map<string, unknown>();

  private constructor() {}

  getScroll(key: string): ScrollPos | undefined {
    return this.scroll.get(key);
  }

  setScroll(key: string, pos: ScrollPos): void {
    this.scroll.set(key, pos);
  }

  hasValue(key: string): boolean {
    return this.values.has(key);
  }

  getValue<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  setValue<T>(key: string, value: T): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.scroll.clear();
    this.values.clear();
  }
}

export const viewMemory: ViewMemory = ViewMemory.getInstance();
