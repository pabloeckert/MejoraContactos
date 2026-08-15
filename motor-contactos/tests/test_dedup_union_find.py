from motor.dedup.union_find import UnionFind


def test_elementos_sin_union_quedan_en_grupos_propios():
    uf = UnionFind([1, 2, 3])
    grupos = uf.grupos()
    assert sorted(grupos.values()) == [[1], [2], [3]]


def test_union_simple():
    uf = UnionFind([1, 2, 3])
    uf.unir(1, 2)
    grupos = uf.grupos()
    assert sorted(grupos[uf.encontrar(1)]) == [1, 2]
    assert grupos[uf.encontrar(3)] == [3]


def test_union_transitiva():
    uf = UnionFind([1, 2, 3, 4])
    uf.unir(1, 2)
    uf.unir(2, 3)
    assert uf.encontrar(1) == uf.encontrar(3)
    grupo = sorted(g for g in uf.grupos().values() if len(g) == 3)[0]
    assert grupo == [1, 2, 3]


def test_raiz_estable_es_la_menor():
    uf = UnionFind([5, 2, 9])
    uf.unir(9, 5)
    uf.unir(5, 2)
    assert uf.encontrar(9) == 2
