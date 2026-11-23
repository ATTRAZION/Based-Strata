# Strata + Basalt

Русский · [English](README.en.md)

Локальная сборка, в которой **Strata** сама запускает и обслуживает **Basalt** как движок моделей.
Изменены только интерфейс Strata и его хост — чтобы приложение видело состояние Basalt и работало с ним как со своим.

Ссылки: [Strata](https://github.com/Niko1221/Strata) · [Basalt](https://github.com/jesdga95/basalt) · [basalt.jgulfo.com](https://basalt.jgulfo.com)

## Что здесь происходит

Strata поднимает управляемый сервер Basalt на `127.0.0.1:18511`, держит ключ `/metrics` в памяти процесса
и каждые 1,5 с читает `/health` и `/metrics`. Из этих ответов собираются показания, которые раньше
в такой сборке выглядели пустыми.

## Ветки и состояние

- `basedstrata-0220` — эта сборка: Strata 0.2.20 с интегрированным Basalt 0.5.6, шесть коммитов поверх тега `v0.2.20`.
- `main` — зеркало апстрима Strata, чтобы когда-нибудь сделать rebase на свежую версию.

Правки не переносились на текущий `main` Strata: между `c775728` и головой `main` несколько тысяч коммитов,
и перенос требует разбора конфликтов в хосте и на экране Монитора с повторной проверкой интерфейса.

## Сборка и проверка

```bash
cd app/host
npm install
npm run build          # dist для хоста
npm run typecheck      # tsc --noEmit
node --test --test-timeout=180000 tests/basalt-monitor.test.mjs tests/no-model-chat.test.mjs tests/chat-shortcuts.test.mjs tests/runtime-models.test.mjs
```

Хост подхватывает управляемый профиль Basalt из `basalt-local.json` рядом с папкой `host` (файл не хранится в репозитории: пути к модели и Python у каждой машины свои):

```json
{ "config": "../../basalt_config.json", "port": 18511, "release": "../../basalt-v0.5.6-windows-x64", "python": "../../src/.venv/Scripts/python.exe" }
```

`config` — профиль Basalt с одним `.basalt`-пакетом, `release` — распакованный архив движка, `python` — интерпретатор для `basalt-server.py`.
В архиве 0.5.6 для Windows нет CUDA-библиотек, без которых `binasalt.exe` завершается с `0xC0000135`: положите рядом с ним `cublas64_13.dll`, `cublasLt64_13.dll` и `cudart64_13.dll` (они есть в архиве 0.4.1 или в CUDA 13). Ключ `/metrics` создаётся при старте и в настройки не пишется;
снаружи `/metrics` остаётся закрыт (401) — читает его только сам хост. Логи управляемого сервера —
`managed-basalt.log` в папке профиля Strata.

## Чего здесь нет

- Своего формата моделей или своего сервера: пакет `.basalt` обслуживает официальный Basalt.
- Бейджей, галерей и спонсорских блоков апстрима: это рабочая сборка под одну машину, а не витрина.
- Результатов тестов `timeskip-real` и `tune-and-timeskip-routes`: им нужен модуль `strata_cli`, которого в этой среде нет.

## Лицензии и авторство

Код Strata — [Niko1221/Strata](https://github.com/Niko1221/Strata), лицензия MIT (файл `LICENSE`).
Движок Basalt — [jesdga95/basalt](https://github.com/jesdga95/basalt), сайт [basalt.jgulfo.com](https://basalt.jgulfo.com).
Этот репозиторий — личная сборка и не связан с авторами Strata и Basalt; их названия и торговые марки принадлежат им.
