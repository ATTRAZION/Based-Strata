/* All the interface strings of one language (ru): the base file and the 13 add-on files, merged in the order the app has always used (a later file wins).
 Loaded the first time the language is used (see loadCatalog in i18n.ts); English stays in the main file because the English text is the key. */
import base from '../locales/ru.json';
import tune from '../locales/tune-ru.json';
import tools from '../locales/tools-ru.json';
import fix from '../locales/fix-ru.json';
import gh from '../locales/gh-ru.json';
import ui from '../locales/ui-ru.json';
import engine from '../locales/engine-ru.json';
import pick from '../locales/pick-ru.json';
import df2 from '../locales/df2-ru.json';
import upd from '../locales/upd-ru.json';
import r3 from '../locales/r3-ru.json';
import pic from '../locales/pic-ru.json';
import gui from '../locales/gui-ru.json';
import sav from '../locales/sav-ru.json';
import net from '../locales/net-ru.json';
const basalt = {
    'Starting Basalt…': 'Запуск Basalt…',
    'Stopping Basalt…': 'Остановка Basalt…',
    'Loading model weights…': 'Загрузка весов модели…',
    'Ready. Model loads on the first message.': 'Готово. Модель загрузится по первому сообщению.',
    'Prepare Basalt': 'Подготовить Basalt',
    'Stop Basalt': 'Остановить Basalt',
    'Configure Basalt': 'Настроить Basalt',
    'Apply Basalt settings': 'Применить настройки Basalt',
    'Save Basalt preset': 'Сохранить пресет Basalt',
    'Basalt conversation context': 'Контекст диалога Basalt',
    'Basalt drafting': 'Предсказание Basalt',
    '384K extends the model with YaRN.': 'Для контекста 384K используется YaRN.',
    'Apply the Basalt settings without loading weights, or load the model.': 'Можно применить настройки без загрузки весов или сразу загрузить модель.',
    'Basalt RAM reserve (MiB)': 'Резерв ОЗУ для системы (МиБ)',
    'Basalt VRAM reserve (MiB)': 'Резерв видеопамяти для системы (МиБ)',
    'Unload after idle (seconds, 0 to disable)': 'Выгрузить при простое (секунды, 0 — отключить)',
    'Start Basalt': 'Запустить Basalt',
    'Basalt is already running.': 'Basalt уже запущен.',
    'Basalt is not running.': 'Basalt не запущен.',
    'Brings the model engine this app owns up': 'Запускает движок моделей, который это приложение ведёт само',
    'Loading model into memory': 'Загрузка модели в память',
    'Generating response': 'Генерация ответа',
    'The model rests in memory': 'Модель отдыхает в памяти',
    'The model is unloaded': 'Модель выгружена',
    'The model this app runs by itself answers a chat that names no model': 'Модель, которую это приложение ведёт само, отвечает в чате, где модель не выбрана',
    // Имя этой сборки: Strata, внутри которой Basalt.
    'BasedStrata': 'BasedStrata',
    'BasedStrata — open chat': 'BasedStrata — открыть чат',
    'Quit BasedStrata': 'Выйти из BasedStrata',
    'Quit BasedStrata?': 'Выйти из BasedStrata?',
    'BasedStrata has stopped': 'BasedStrata остановлена',
    'BasedStrata has stopped. You can close this tab. To use it again, start BasedStrata from its icon.': 'BasedStrata остановлена. Можно закрыть эту вкладку. Чтобы пользоваться снова, запусти BasedStrata значком.',
    'BasedStrata could not be stopped from here. Run the app with --quit in a terminal, or try again.': 'BasedStrata не удалось остановить отсюда. Запусти приложение с --quit в терминале или попробуй ещё раз.',
    'This stops the model and ends BasedStrata. Your chats and files stay as they are. Closing the browser tab alone would leave BasedStrata running.': 'Это остановит модель и завершит BasedStrata. Чаты и файлы останутся как есть. Если просто закрыть вкладку, BasedStrata продолжит работать.',
    'Set up BasedStrata': 'Настроить BasedStrata',
    'Welcome to BasedStrata': 'Добро пожаловать в BasedStrata',
    'A quick tour of BasedStrata': 'Краткое знакомство с BasedStrata',
    'Message BasedStrata': 'Написать BasedStrata',
    'Message BasedStrata…': 'Написать BasedStrata…',
    'Connect BasedStrata to an app': 'Подключите BasedStrata к приложению',
    'Notify me when BasedStrata needs an answer': 'Сообщать, когда BasedStrata ждёт ответа',
    'In Manual mode, shows a desktop notification when the assistant waits for your approval and BasedStrata is in the background.': 'В ручном режиме показывает системное уведомление, когда ассистент ждёт твоего разрешения, а BasedStrata на заднем плане.',
};
export default {...base,...tune,...tools,...fix,...gh,...ui,...engine,...pick,...df2,...upd,...r3,...pic,...gui,...sav,...net,...basalt} as Record<string,string>;
