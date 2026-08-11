"""Union-find clásico para construir clusters a partir de pares de alta
confianza."""

from __future__ import annotations


class UnionFind:
    def __init__(self, elementos: list[int]) -> None:
        self._padre = {e: e for e in elementos}

    def encontrar(self, x: int) -> int:
        while self._padre[x] != x:
            self._padre[x] = self._padre[self._padre[x]]
            x = self._padre[x]
        return x

    def unir(self, x: int, y: int) -> None:
        raiz_x, raiz_y = self.encontrar(x), self.encontrar(y)
        if raiz_x == raiz_y:
            return
        # Raíz estable = la menor de las dos, así corridas sucesivas sobre
        # los mismos datos producen los mismos grupos sin depender de orden.
        if raiz_x > raiz_y:
            raiz_x, raiz_y = raiz_y, raiz_x
        self._padre[raiz_y] = raiz_x

    def grupos(self) -> dict[int, list[int]]:
        grupos: dict[int, list[int]] = {}
        for elemento in self._padre:
            raiz = self.encontrar(elemento)
            grupos.setdefault(raiz, []).append(elemento)
        return grupos
