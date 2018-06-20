'use strict';
import * as gemfile from "gemfile";
import * as path from "path";
import * as vscode from 'vscode';
import * as rp from "request-promise-native";
import * as he from 'he';
import * as sanitizeHtml from 'sanitize-html';
// class GemfileProvider implements vscode.DocumentLinkProvider{
//     public provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken){
//         let wordRange = document.getWordRangeAtPosition(document.);
//         let link = new vscode.DocumentLink(wordRange);
//         return [link]
//     }
// }
function activedEditor(){
    return vscode.window.activeTextEditor
}

function activePosition(){
    return activedEditor() && vscode.window.activeTextEditor.selection.active;
}

function isGemfile(){
    return activedEditor() && path.basename(vscode.window.activeTextEditor.document.fileName) == "Gemfile"
}

// Track currently webview panel
var currentPanel: vscode.WebviewPanel | undefined = undefined;

function injectBase(html, base ="") {
  let policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'self';frame-ancestors *;sandbox allow-top-navigation allow-top-navigation-by-user-activation;child-src 'self' https://www.rubydoc.info; img-src vscode-resource: https: http:; script-src vscode-resource: https: 'unsafe-inline' 'unsafe-eval'; style-src vscode-resource: http: https: 'unsafe-inline';">`;
  let _base = base ? path.dirname(base) + "/" :"";
  let baseHtml = _base ? `<base href="${_base}">\n`:"";
  // Remove any <base> elements inside <head>
  var _html = html.replace(
    /(<[^>/]*head[^>]*>)[\s\S]*?(<[^>/]*base[^>]*>)[\s\S]*?(<[^>]*head[^>]*>)/gim,
    "$1 $3"
  );

  // // Add <base> just before </head>
  // html = html.replace(
  //   /(<[^>/]*head[^>]*>[\s\S]*?)(<[^>]*head[^>]*>)/gim,

  // );
  _html = _html.replace(
    /<head>/gim,
    `<head>${baseHtml}${policy}\n`
  );
  return _html;
}

async function doRequest(url: string, symbol: string,endpoint:string) {
  let context: vscode.ExtensionContext = this;
  let iframUrl = `https://www.rubydoc.info/list/gems/${endpoint}/class?1`;
  let iframe =  await rp(iframUrl);
    iframe = he.encode(iframe)
  let request = rp(url)
    .then(function(htmlString) {
      let html = injectBase(htmlString, url);
      html = html.replace(/(<[^>/]*iframe[^>]*>[\s\S]*?)(<[^>]*iframe[^>]*>)/gim,`<iframe sandbox="allow-same-origin allow-scripts allow-top-navigation allow-top-navigation-by-user-activation" srcdoc="${iframe}"></iframe>`)
      const columnToShowIn = vscode.window.activeTextEditor
        ? vscode.window.activeTextEditor.viewColumn
        : undefined;
      if (currentPanel) {
        // If we already have a panel, show it in the target column

        currentPanel.webview.html = html;
        currentPanel.title = `Document ${symbol}`;
        currentPanel.reveal(columnToShowIn);
      } else {
        currentPanel = vscode.window.createWebviewPanel(
          "Document",
          `Document ${symbol}`,
          vscode.ViewColumn.Two,
          {
            // Enable scripts in the webview
            enableScripts: true,
            retainContextWhenHidden: true
          }
        );

        currentPanel.webview.html = html;
        // Reset when the current panel is closed
        currentPanel.onDidDispose(
          () => {
            currentPanel = undefined;
            request.abort();
          },
          null,
          context.subscriptions
        );
      }
    })
    .catch(function(err) {
      console.error(err)
      // Crawling failed...
      // context.logger.debug(err);
    });
}

export async function activate(context: vscode.ExtensionContext) {
    // const GemFile: vscode.DocumentFilter = {
    //     pattern: "**/views/**",
    //     scheme: "file"
    //   };
    let info = await vscode.workspace.findFiles("Gemfile.lock").then( ( uris)=>{
        return gemfile.parse(uris[0].fsPath)
    })
    // let info = gemfile.parseSync(vscode.workspace.asRelativePath("./Gemfile.lock",true));
    let specs = info.GEM.specs
    let disposable = vscode.commands.registerCommand('Gemfile:Document', async () => {
        if(!isGemfile()){
            return;
        }
        let cur = activePosition();
        if(!cur){
            return;
        }
        let document = vscode.window.activeTextEditor.document;
        let gemRange = document.getWordRangeAtPosition(cur,/([A-Za-z\/0-9_-]+)(\.[A-Za-z0-9]+)*/);
        let gem = document.getText(gemRange);
        var endpoint;
        if(gem in specs){
            let version = specs[gem].version;
            endpoint = `${gem}/${version}`
        }
        console.log(gem,endpoint)
        if(!endpoint){
            return
        }
        let url = `https://www.rubydoc.info/gems/${endpoint}`
        doRequest.call(context, url, gem,endpoint);
    });
    // let disposable = vscode.languages.registerDocumentLinkProvider(GemFile, new GemfileProvider())

    context.subscriptions.push(disposable);
}

export function deactivate() {
}