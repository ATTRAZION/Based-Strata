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
В архиве 0.5.6 для Windows нет CUDA-библиотек, без которых `bin\basalt.exe` завершается с `0xC0000135`: положите рядом с ним `cublas64_13.dll`, `cublasLt64_13.dll` и `cudart64_13.dll` (они есть в архиве 0.4.1 или в CUDA 13). Ключ `/metrics` создаётся при старте и в настройки не пишется;
снаружи `/metrics` остаётся закрыт (401) — читает его только сам хост. Логи управляемого сервера —
`managed-basalt.log` в папке профиля Strata.

## Установщик с Basalt

Установщик собирается из четырёх компонентов, и каждый стейджится своей командой: `control` (Python 3.12.15 и
`strata_control`), `harness`, `basalt` (движок, его профиль и managed-профиль) и UI. Ни `control`, ни `harness`,
ни `basalt` в репозитории не лежат.

```bash
# 1. Control нужной версии (сейчас 0.1.66)
python app/desktop/scripts/stage-control.py

# 2. Basalt 0.5.6, его профиль и пути к модели — одной командой
python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt

# 3. Harness из собранного чекаута (pnpm install --frozen-lockfile && pnpm run build:artifacts)
node app/desktop/scripts/stage-harness.mjs --src <путь к deepseek-harness>

# 4. Сам установщик
cd app/desktop && npm ci && npm run build
```

`stage-basalt.py` копирует распакованный релиз Basalt (`bin/`, `serve/`, `tools/`, `data/`) и **профиль**
`basalt_config.json` в `app/desktop/src-tauri/resources/basalt`. `basalt-local.json` установщик больше не несёт:
приложение создаёт его при первом запуске (`app/host/server/basalt-profile.mjs`) со свободным портом этой машины и
только относительными путями внутри установки:

```json
{ "config": "basalt/basalt_config.json", "port": 50856, "release": "basalt", "python": "control/python/python.exe" }
```

Старый профиль с абсолютным `config` (от прежних сборок) при запуске заменяется на такой же относительный. Если
папка установки только для чтения (Program Files), профиль ложится рядом с данными пользователя. Путь к
`.basalt`-пакет задаётся при стейджинге: `--model` (или `STRATA_BASALT_MODEL`); без `--model` берётся путь из
исходного профиля. В установленном профиле пакет назван только по имени файла, а если он лежит внутри релиза —
относительным путём. При запуске приложение ищет его в своей папке моделей (Settings → Model directory) и, если
файла нет, пишет, куда его положить, вместо падения запуска; веса в установщик не входят. Пути к релизу и
профилю можно передать переменными окружения (`STRATA_BASALT_SRC`,
`STRATA_BASALT_CONFIG`, `STRATA_BASALT_MODEL`) или из `app/desktop`: `npm run stage:basalt -- --src ... --config ... --model ...`.
Проверка застейдженного — `python app/desktop/scripts/stage-basalt.py --check`.

Вся сборка одной строкой (пути к Basalt и Harness — свои):

```bash
python app/desktop/scripts/stage-control.py && python app/desktop/scripts/stage-basalt.py --src D:\Basalt\basalt-v0.5.6-windows-x64 --config D:\Basalt\basalt_config.json --model D:\Basalt\models\model.basalt && node app/desktop/scripts/stage-harness.mjs --src <путь к deepseek-harness> && cd app/desktop && npm ci && npm run build
```

Готовый установщик: `app/desktop/src-tauri/target/release/bundle/nsis/BasedStrata_0.2.20_x64-setup.exe`.

## Чего здесь нет

- Своего формата моделей или своего сервера: пакет `.basalt` обслуживает официальный Basalt.
- Бейджей, галерей и спонсорских блоков апстрима: это рабочая сборка под одну машину, а не витрина.
- Результатов тестов `timeskip-real` и `tune-and-timeskip-routes`: им нужен модуль `strata_cli`, которого в этой среде нет.

## Лицензии и авторство

Код Strata — [Niko1221/Strata](https://github.com/Niko1221/Strata), лицензия MIT (файл `LICENSE`).
Движок Basalt — [jesdga95/basalt](https://github.com/jesdga95/basalt), сайт [basalt.jgulfo.com](https://basalt.jgulfo.com).
Этот репозиторий — личная сборка и не связан с авторами Strata и Basalt; их названия и торговые марки принадлежат им.
