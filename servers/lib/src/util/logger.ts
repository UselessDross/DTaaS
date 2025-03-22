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

    // New helper method to return a formatted timestamp.
    private getFormattedTimestamp(): string {
        // You can customize the format here. For example, toLocaleTimeString returns HH:MM:SS.
        return new Date().toLocaleTimeString();
    }

    private printWrappedMessage(
        message: string,
        maxLineLength: number,
        ColorChar: string,
        MSG_SYMBOLD: string,
    ): void {
        const timestamp = this.getFormattedTimestamp();
        let output = `${ColorChar}${MSG_SYMBOLD} ${timestamp} ${MSG_SYMBOLD} ${message}`;
        // Optionally add word wrapping if needed:
        console.log(output + ColorUtility.RESET);
    }
}

export { Logger };
