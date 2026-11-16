'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplatePathProvider = void 0;
const path_1 = require("path");
const vscode_1 = require("vscode");
const constants_1 = require("../constants");
const regex = (regexes) => new RegExp(regexes.map(re => re.source).join(''));
const quote = /(?:'|")/;
const path_re = /([\w/-]+\.[\w]+)/;
const rel_path_re = /((?:(?:\.\/|(?:\.\.\/)+))[\w/-]+\.[\w]+)/;
// django-cotton component tag, like <c-card> or <c-forms.text-input />
const COMPONENT_RE = /<c-([\w.-]+)/g;
const PATH_RE = regex([quote, path_re, quote]);
const RELATIVE_PATH_RE = regex([quote, rel_path_re, quote]);
const BEGIN_OF_FILE = new vscode_1.Position(0, 0);
const cache = {};
class TemplatePathProvider {
    constructor() {
        this.selector = [constants_1.DJANGO_HTML_SELECTOR, constants_1.PYTHON_SELECTOR];
    }
    static getTemplate(document, position, token) {
        let path;
        let search;
        const line = document.lineAt(position.line).text;
        const match = line.match(PATH_RE);
        const relative_match = line.match(RELATIVE_PATH_RE);
        if (relative_match) {
            path = relative_match[1];
            search = vscode_1.workspace.asRelativePath((0, path_1.resolve)((0, path_1.dirname)(document.uri.path), path));
        }
        else if (match) {
            path = match[1];
            search = `**/{templates,jinja2}/${path}`;
        }
        else {
            return TemplatePathProvider.getComponent(line, position, token);
        }
        const pos = position.character;
        const cursorOverPath = pos > line.indexOf(path) && pos < line.indexOf(path) + path.length;
        return cursorOverPath ? TemplatePathProvider.find(search, token) : Promise.resolve(null);
    }
    // <c-forms.text-input> lives in cotton/forms/text_input.html or cotton/forms/text_input/index.html
    static getComponent(line, position, token) {
        COMPONENT_RE.lastIndex = 0;
        let match;
        while ((match = COMPONENT_RE.exec(line))) {
            const start = match.index + 3;
            if (position.character < start || position.character > start + match[1].length)
                continue;
            const dir = vscode_1.workspace.getConfiguration('django').get('cotton.dir', 'cotton');
            const path = match[1].replace(/-/g, '_').replace(/\./g, '/');
            return TemplatePathProvider.find(`**/templates/${dir}/{${path}.html,${path}/index.html}`, token);
        }
        return Promise.resolve(null);
    }
    static find(search, token) {
        if (search in cache) {
            return Promise.resolve(cache[search]);
        }
        return vscode_1.workspace.findFiles(search, '', 1, token).then(results => {
            const result = results.length ? results[0] : null;
            if (result)
                cache[search] = result;
            return result;
        });
    }
    provideDefinition(document, position, token) {
        return TemplatePathProvider.getTemplate(document, position, token).then(template => {
            if (!template)
                return null;
            return new vscode_1.Location(template, BEGIN_OF_FILE);
        });
    }
}
exports.TemplatePathProvider = TemplatePathProvider;
//# sourceMappingURL=definitionProvider.js.map