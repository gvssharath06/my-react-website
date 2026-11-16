'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateFormattingProvider = void 0;
const child_process = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path_1 = require("path");
const vscode_1 = require("vscode");
const constants_1 = require("../constants");
// Runs the formatter set in django.format.command, like ["djlint", "-", "--reformat"].
// The template is sent on stdin and the formatted template is read from stdout.
class TemplateFormattingProvider {
    constructor() {
        this.selector = constants_1.DJANGO_HTML_SELECTOR;
    }
    // child_process does not exist in VS Code for the Web
    static isAvailable() {
        return typeof child_process.spawn === 'function';
    }
    provideDocumentFormattingEdits(document, _options, token) {
        const command = vscode_1.workspace.getConfiguration('django', document).get('format.command', []);
        if (!command.length)
            return [];
        const text = document.getText();
        return run(command, text, cwd(document), token).then(formatted => {
            if (formatted === null || formatted === text)
                return [];
            return [new vscode_1.TextEdit(new vscode_1.Range(document.positionAt(0), document.positionAt(text.length)), formatted)];
        });
    }
}
exports.TemplateFormattingProvider = TemplateFormattingProvider;
function cwd(document) {
    const folder = vscode_1.workspace.getWorkspaceFolder(document.uri);
    return folder ? folder.uri.fsPath : (0, path_1.dirname)(document.uri.fsPath);
}
// Finds the tools installed in the project virtual environment first
function env(cwd) {
    var _a;
    const bin = (0, path_1.join)(cwd, '.venv', process.platform === 'win32' ? 'Scripts' : 'bin');
    if (!fs.existsSync(bin))
        return process.env;
    return Object.assign(Object.assign({}, process.env), { PATH: `${bin}${path_1.delimiter}${(_a = process.env.PATH) !== null && _a !== void 0 ? _a : ''}` });
}
function run(command, input, cwd, token) {
    const [program, ...args] = command;
    return new Promise(resolve => {
        const child = child_process.spawn(program, args, { cwd, env: env(cwd) });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk);
        child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk);
        token.onCancellationRequested(() => child.kill());
        child.on('error', error => {
            const reason = error.code === 'ENOENT' ? 'not found' : error.message;
            vscode_1.window.showErrorMessage(`Django: cannot format with ${program}: ${reason}. Check django.format.command.`);
            resolve(null);
        });
        child.on('close', code => {
            if (token.isCancellationRequested)
                return resolve(null);
            if (code !== 0) {
                vscode_1.window.showErrorMessage(`Django: ${program} failed (exit ${code}): ${stderr.trim().split('\n').pop()}`);
                return resolve(null);
            }
            // An empty output would wipe the template
            resolve(stdout || !input ? stdout : null);
        });
        child.stdin.on('error', () => undefined);
        child.stdin.end(input);
    });
}
//# sourceMappingURL=formattingProvider.js.map