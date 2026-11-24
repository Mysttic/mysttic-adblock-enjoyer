# Privacy tab answers

Copy each block into the matching field of the Privacy tab in the Developer Dashboard.

## Single purpose

```
Stops the Ad-Shield anti-adblock script from blanking the page, showing its "Please allow ads on this site" dialog and redirecting the user. The extension does this one thing and has no other features.
```

## Permission justification

The manifest declares no API permissions. The only access is the content script's host match
`*://*/*`, which the dashboard lists as host permission.

```
The content script must run at document_start on every site, because Ad-Shield is embedded on many unrelated websites and has to be neutralised before the page's own scripts execute. There is no list of affected sites to restrict it to. The script only inspects <script> elements for Ad-Shield's code signature and changes the two matching elements (it removes their onload/onerror/src attributes and sets a non-executable type). It reads no page text, form data, cookies or browsing history, and it makes no network requests. On pages without Ad-Shield it disconnects its observer when the document has finished parsing.
```

## Remote code

Select "No, I am not using remote code".

```
All code ships in the package. The extension loads no remote scripts and uses no eval.
```

## Data usage

- Leave every data collection box unchecked. The extension collects no user data.
- Tick all the certification statements. They hold: no data is sold, used or transferred.

## Privacy policy

The field needs a public URL. The policy text is [`PRIVACY.md`](../PRIVACY.md). While this
repository is private that file has no public address, so publish the text somewhere public
(for example a GitHub gist or a page on your own site) and paste that URL.
