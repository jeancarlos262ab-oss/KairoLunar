import { createContext, useContext } from "react";

/**
 * Indica si la vista que contiene al componente es la que se está mostrando.
 * Las vistas visitadas siguen montadas (para no recrear WebGL) aunque estén ocultas;
 * con esto pueden pausar lo que no tenga sentido hacer mientras no se ven.
 */
export const ViewActiveContext = createContext<boolean>(true);

export const useViewActive = (): boolean => useContext(ViewActiveContext);
