import { Injectable, Logger } from '@nestjs/common'; // =added To Follow The NestJS pattern=
import { IConsoleLogger } from "./Interfaces/IConsoleLogger";
import { ColorUtility } from "./ColorUtility.js";
//=removed=
//Ensure the ConsoleLogger class is properly set up as a NestJS service.
const LINE_LENGTH: number = 90;
const INDENT_SPACES: string = "              "; //14 spaces

@Injectable()
export class ConsoleLogger extends Logger implements IConsoleLogger {
    // constructor() { super(); }

    ErrorMsg(message: string, maxLineLength: number = LINE_LENGTH): void {
        this.printWrappedMessage(message, maxLineLength, ColorUtility.FG_RED, "• ERR •");
    }
    WarningMsg(message: string, maxLineLength: number = LINE_LENGTH): void {
        this.printWrappedMessage(message, maxLineLength, ColorUtility.FG_YELLOW, "//WRN//");
    }
    LogMsg(message: string, maxLineLength: number = LINE_LENGTH): void {
        this.printWrappedMessage(message, maxLineLength, ColorUtility.FG_BLACK, "  MSG  ");
    }

    private printWrappedMessage(
        message: string,
        maxLineLength: number,
        ColorChar: string,
        MSG_SYMBOLD: string,
    ): void {
        const _date = new Date();
        const year = _date.getFullYear();
        const month = (_date.getMonth() + 1).toString().padStart(2, '0');
        const day = _date.getDate().toString().padStart(2, '0');
        const hour = _date.getHours().toString().padStart(2, '0');
        const minute = _date.getMinutes().toString().padStart(2, '0');
        const second = _date.getSeconds().toString().padStart(2, '0');
        const timestamp = `${year}.${month}.${day}|${hour}:${minute}:${second}`;

        // Build a prefix string and compute an indent (without color codes) for wrapped lines.
        const prefixText = `${MSG_SYMBOLD} - ${timestamp} - ${MSG_SYMBOLD} `;
        const prefix = `${ColorChar}${prefixText}`;
        const indent = " ".repeat(prefixText.length);

        const words = message.split(" ");
        let currentLine = "";
        let output = prefix;

        for (const word of words) {
            if ((currentLine + word).length > maxLineLength) {
                output += currentLine.trim() + "\n" + indent;
                currentLine = word + " ";
            } else {
                currentLine += word + " ";
            }
        }
        output += currentLine.trim();

        console.log(output + ColorUtility.RESET);
    }
}

export { Logger };
