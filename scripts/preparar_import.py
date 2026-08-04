#!/usr/bin/env python3
"""Prepara os CSVs de staging para a migração v7.

Lê as planilhas exportadas (Guru Contatos + Respostas do Quiz) e gera dois CSVs
com exatamente as colunas que stg_guru_contacts e stg_quiz_responses esperam.

A normalização pesada (e-mail sujo, telefone E.164) fica no banco, nas funções
normalize_email/normalize_phone_br — assim a mesma regra vale para a importação
histórica e para todo lead novo. Aqui só juntamos e renomeamos colunas.

Uso:
    python3 scripts/preparar_import.py ../planilhas ../planilhas/output
"""

import sys
from pathlib import Path

import pandas as pd

GURU_COLS = {
    "nome contato": "nome",
    "doc contato": "doc",
    "email contato": "email",
    "código do país": "codigo_pais",
    "telefone contato": "telefone",
    "criado em": "criado_em",
    "vendas aprovadas": "vendas_aprovadas",
    "total venda": "total_venda",
    "total líquido": "total_liquido",
    "data última venda": "data_ultima_venda",
}

QUIZ_COLS = {
    "Data/Hora": "data_hora",
    "Nome": "nome",
    "E-mail": "email",
    "Urgência": "urgencia",
    "Renda": "renda",
    "Motivação": "motivacao",
    "Obstáculo": "obstaculo",
    "Segmento": "segmento",
}


def carregar_guru(pasta: Path) -> pd.DataFrame:
    """Junta todas as exportações de Contatos da Guru encontradas na pasta."""
    arquivos = sorted(pasta.glob("Guru-Contatos-*.xlsx"))
    if not arquivos:
        raise SystemExit(f"Nenhum arquivo Guru-Contatos-*.xlsx em {pasta}")

    partes = []
    for arq in arquivos:
        df = pd.ExcelFile(arq).parse("Contatos")
        faltando = set(GURU_COLS) - set(df.columns)
        if faltando:
            raise SystemExit(f"{arq.name}: colunas ausentes {sorted(faltando)}")
        partes.append(df[list(GURU_COLS)].rename(columns=GURU_COLS))
        print(f"  {arq.name}: {len(df)} linhas")

    guru = pd.concat(partes, ignore_index=True)

    # O mesmo contato pode aparecer em duas exportações. Fica o registro com mais
    # vendas — é o mais completo. O banco também trata isso, mas subir CSV menor
    # é mais rápido e deixa a conferência mais clara.
    guru["_vendas"] = pd.to_numeric(guru["vendas_aprovadas"], errors="coerce").fillna(0)
    guru["_email"] = guru["email"].astype(str).str.split("?").str[0].str.strip().str.lower()
    antes = len(guru)
    guru = guru.sort_values("_vendas", ascending=False).drop_duplicates("_email")
    print(f"  deduplicado por e-mail: {antes} → {len(guru)}")

    return guru.drop(columns=["_vendas", "_email"])


def carregar_quiz(pasta: Path) -> pd.DataFrame:
    arquivos = sorted(pasta.glob("*Respostas do Quiz*.xlsx"))
    if not arquivos:
        raise SystemExit(f"Nenhuma planilha de respostas do quiz em {pasta}")

    df = pd.ExcelFile(arquivos[0]).parse(0)
    faltando = set(QUIZ_COLS) - set(df.columns)
    if faltando:
        raise SystemExit(f"{arquivos[0].name}: colunas ausentes {sorted(faltando)}")
    print(f"  {arquivos[0].name}: {len(df)} linhas")

    quiz = df[list(QUIZ_COLS)].rename(columns=QUIZ_COLS)
    # ISO para o Postgres ler sem ambiguidade de dia/mês.
    quiz["data_hora"] = pd.to_datetime(quiz["data_hora"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    return quiz


def main() -> None:
    entrada = Path(sys.argv[1] if len(sys.argv) > 1 else "../planilhas").expanduser().resolve()
    saida = Path(sys.argv[2] if len(sys.argv) > 2 else entrada / "output").expanduser().resolve()
    saida.mkdir(parents=True, exist_ok=True)

    print("Guru (contatos):")
    guru = carregar_guru(entrada)
    print("Quiz (respostas):")
    quiz = carregar_quiz(entrada)

    destino_guru = saida / "stg_guru_contacts.csv"
    destino_quiz = saida / "stg_quiz_responses.csv"
    guru.to_csv(destino_guru, index=False, encoding="utf-8")
    quiz.to_csv(destino_quiz, index=False, encoding="utf-8")

    compradores = (pd.to_numeric(guru["vendas_aprovadas"], errors="coerce").fillna(0) > 0).sum()
    print()
    print(f"→ {destino_guru}  ({len(guru)} contatos, {compradores} com compra)")
    print(f"→ {destino_quiz}  ({len(quiz)} respostas)")
    print()
    print("Suba os dois pelo Table Editor do Supabase e rode a PARTE 2 da migração v7.")


if __name__ == "__main__":
    main()
