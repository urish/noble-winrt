# Noble (Node.js Bluetooth LE) Bindings for Windows

`noble-winrt` is a small UWP-to-noble bridge based on the [web-bluetooth-polyfill](https://github.com/urish/web-bluetooth-polyfill) project. It supports BLE connectivity on Windows without the need for a dongle and complicated driver set-up. It is similar to [noble-uwp](https://github.com/jasongin/noble-uwp) but may work better for some build processes. 


## Getting Started

Install with npm or yarn:
```javascript
npm install --save noble-winrt
```
Then simply use in place of `noble`:
```javascript
const noble = require('noble-winrt');
```

`noble-winrt` will perform exactly the same as `noble` on non-Windows systems. However, it will use the WinRT bindings on Windows instead of `noble`'s default Bluetooth HCI bindings.

## Integrating with bleat

If you'd like to use this library to work with the Web Bluetooth api through [bleat](https://github.com/thegecko/bleat), you will have to replace `noble` to `noble-winrt`. Running the following command in a powershell terminal in the directory containing your project's `node_modules` should take care of that:

```powershell
node -e "var fs = require('fs'), `
  f = 'node_modules/bleat/dist/adapter.noble.js'; `
  fs.writeFileSync(f, fs.readFileSync(f).toString().replace(`
    'require(\'noble\')', 'require(\'noble-winrt\')'))"
```
