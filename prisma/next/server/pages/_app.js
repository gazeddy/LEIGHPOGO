/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "pages/_app";
exports.ids = ["pages/_app"];
exports.modules = {

/***/ "(pages-dir-node)/./components/Navbar.js":
/*!******************************!*\
  !*** ./components/Navbar.js ***!
  \******************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ Navbar)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"react/jsx-dev-runtime\");\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/link */ \"(pages-dir-node)/./node_modules/next/link.js\");\n/* harmony import */ var next_link__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_link__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next-auth/react */ \"next-auth/react\");\n/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_auth_react__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! react */ \"react\");\n/* harmony import */ var react__WEBPACK_IMPORTED_MODULE_3___default = /*#__PURE__*/__webpack_require__.n(react__WEBPACK_IMPORTED_MODULE_3__);\n\n\n\n\nfunction Navbar() {\n    const { data: session, status } = (0,next_auth_react__WEBPACK_IMPORTED_MODULE_2__.useSession)();\n    const [open, setOpen] = (0,react__WEBPACK_IMPORTED_MODULE_3__.useState)(false);\n    if (status === \"loading\") return null; // avoid flicker while loading\n    const isAdmin = session?.user?.role === \"admin\";\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"nav\", {\n        className: \"navbar\",\n        children: /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n            className: \"nav-inner\",\n            children: [\n                /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((next_link__WEBPACK_IMPORTED_MODULE_1___default()), {\n                    href: \"/\",\n                    className: \"nav-logo\",\n                    children: \"Pok\\xe9mon GO Codes\"\n                }, void 0, false, {\n                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                    lineNumber: 16,\n                    columnNumber: 9\n                }, this),\n                /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"button\", {\n                    className: \"nav-toggle\",\n                    onClick: ()=>setOpen(!open),\n                    children: \"☰\"\n                }, void 0, false, {\n                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                    lineNumber: 20,\n                    columnNumber: 9\n                }, this),\n                /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"div\", {\n                    className: `nav-links ${open ? \"open\" : \"\"}`,\n                    children: [\n                        /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((next_link__WEBPACK_IMPORTED_MODULE_1___default()), {\n                            href: \"/\",\n                            className: \"nav-item\",\n                            children: \"Home\"\n                        }, void 0, false, {\n                            fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                            lineNumber: 25,\n                            columnNumber: 11\n                        }, this),\n                        session && /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.Fragment, {\n                            children: [\n                                /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((next_link__WEBPACK_IMPORTED_MODULE_1___default()), {\n                                    href: \"/entries/add\",\n                                    className: \"nav-item\",\n                                    children: \"Add Entry\"\n                                }, void 0, false, {\n                                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                                    lineNumber: 29,\n                                    columnNumber: 15\n                                }, this),\n                                isAdmin && /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((next_link__WEBPACK_IMPORTED_MODULE_1___default()), {\n                                    href: \"/admin\",\n                                    className: \"nav-item\",\n                                    children: \"Admin Panel\"\n                                }, void 0, false, {\n                                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                                    lineNumber: 30,\n                                    columnNumber: 27\n                                }, this),\n                                /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(\"button\", {\n                                    className: \"nav-btn\",\n                                    onClick: ()=>(0,next_auth_react__WEBPACK_IMPORTED_MODULE_2__.signOut)({\n                                            callbackUrl: \"/login\"\n                                        }),\n                                    children: \"Logout\"\n                                }, void 0, false, {\n                                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                                    lineNumber: 31,\n                                    columnNumber: 15\n                                }, this)\n                            ]\n                        }, void 0, true),\n                        !session && /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)((next_link__WEBPACK_IMPORTED_MODULE_1___default()), {\n                            href: \"/login\",\n                            className: \"nav-item\",\n                            children: \"Login\"\n                        }, void 0, false, {\n                            fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                            lineNumber: 41,\n                            columnNumber: 13\n                        }, this)\n                    ]\n                }, void 0, true, {\n                    fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n                    lineNumber: 24,\n                    columnNumber: 9\n                }, this)\n            ]\n        }, void 0, true, {\n            fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n            lineNumber: 15,\n            columnNumber: 7\n        }, this)\n    }, void 0, false, {\n        fileName: \"/home/angryspanner/projects/Test-backup/components/Navbar.js\",\n        lineNumber: 14,\n        columnNumber: 5\n    }, this);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHBhZ2VzLWRpci1ub2RlKS8uL2NvbXBvbmVudHMvTmF2YmFyLmpzIiwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7QUFBNkI7QUFDeUI7QUFDckI7QUFFbEIsU0FBU0k7SUFDdEIsTUFBTSxFQUFFQyxNQUFNQyxPQUFPLEVBQUVDLE1BQU0sRUFBRSxHQUFHTiwyREFBVUE7SUFDNUMsTUFBTSxDQUFDTyxNQUFNQyxRQUFRLEdBQUdOLCtDQUFRQSxDQUFDO0lBRWpDLElBQUlJLFdBQVcsV0FBVyxPQUFPLE1BQU0sOEJBQThCO0lBRXJFLE1BQU1HLFVBQVVKLFNBQVNLLE1BQU1DLFNBQVM7SUFFeEMscUJBQ0UsOERBQUNDO1FBQUlDLFdBQVU7a0JBQ2IsNEVBQUNDO1lBQUlELFdBQVU7OzhCQUNiLDhEQUFDZCxrREFBSUE7b0JBQUNnQixNQUFLO29CQUFJRixXQUFVOzhCQUFXOzs7Ozs7OEJBSXBDLDhEQUFDRztvQkFBT0gsV0FBVTtvQkFBYUksU0FBUyxJQUFNVCxRQUFRLENBQUNEOzhCQUFPOzs7Ozs7OEJBSTlELDhEQUFDTztvQkFBSUQsV0FBVyxDQUFDLFVBQVUsRUFBRU4sT0FBTyxTQUFTLElBQUk7O3NDQUMvQyw4REFBQ1Isa0RBQUlBOzRCQUFDZ0IsTUFBSzs0QkFBSUYsV0FBVTtzQ0FBVzs7Ozs7O3dCQUVuQ1IseUJBQ0M7OzhDQUNFLDhEQUFDTixrREFBSUE7b0NBQUNnQixNQUFLO29DQUFlRixXQUFVOzhDQUFXOzs7Ozs7Z0NBQzlDSix5QkFBVyw4REFBQ1Ysa0RBQUlBO29DQUFDZ0IsTUFBSztvQ0FBU0YsV0FBVTs4Q0FBVzs7Ozs7OzhDQUNyRCw4REFBQ0c7b0NBQ0NILFdBQVU7b0NBQ1ZJLFNBQVMsSUFBTWhCLHdEQUFPQSxDQUFDOzRDQUFFaUIsYUFBYTt3Q0FBUzs4Q0FDaEQ7Ozs7Ozs7O3dCQU1KLENBQUNiLHlCQUNBLDhEQUFDTixrREFBSUE7NEJBQUNnQixNQUFLOzRCQUFTRixXQUFVO3NDQUFXOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQU1yRCIsInNvdXJjZXMiOlsiL2hvbWUvYW5ncnlzcGFubmVyL3Byb2plY3RzL1Rlc3QtYmFja3VwL2NvbXBvbmVudHMvTmF2YmFyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBMaW5rIGZyb20gXCJuZXh0L2xpbmtcIjtcbmltcG9ydCB7IHVzZVNlc3Npb24sIHNpZ25PdXQgfSBmcm9tIFwibmV4dC1hdXRoL3JlYWN0XCI7XG5pbXBvcnQgeyB1c2VTdGF0ZSB9IGZyb20gXCJyZWFjdFwiO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBOYXZiYXIoKSB7XG4gIGNvbnN0IHsgZGF0YTogc2Vzc2lvbiwgc3RhdHVzIH0gPSB1c2VTZXNzaW9uKCk7XG4gIGNvbnN0IFtvcGVuLCBzZXRPcGVuXSA9IHVzZVN0YXRlKGZhbHNlKTtcblxuICBpZiAoc3RhdHVzID09PSBcImxvYWRpbmdcIikgcmV0dXJuIG51bGw7IC8vIGF2b2lkIGZsaWNrZXIgd2hpbGUgbG9hZGluZ1xuXG4gIGNvbnN0IGlzQWRtaW4gPSBzZXNzaW9uPy51c2VyPy5yb2xlID09PSBcImFkbWluXCI7XG5cbiAgcmV0dXJuIChcbiAgICA8bmF2IGNsYXNzTmFtZT1cIm5hdmJhclwiPlxuICAgICAgPGRpdiBjbGFzc05hbWU9XCJuYXYtaW5uZXJcIj5cbiAgICAgICAgPExpbmsgaHJlZj1cIi9cIiBjbGFzc05hbWU9XCJuYXYtbG9nb1wiPlxuICAgICAgICAgIFBva8OpbW9uIEdPIENvZGVzXG4gICAgICAgIDwvTGluaz5cblxuICAgICAgICA8YnV0dG9uIGNsYXNzTmFtZT1cIm5hdi10b2dnbGVcIiBvbkNsaWNrPXsoKSA9PiBzZXRPcGVuKCFvcGVuKX0+XG4gICAgICAgICAg4piwXG4gICAgICAgIDwvYnV0dG9uPlxuXG4gICAgICAgIDxkaXYgY2xhc3NOYW1lPXtgbmF2LWxpbmtzICR7b3BlbiA/IFwib3BlblwiIDogXCJcIn1gfT5cbiAgICAgICAgICA8TGluayBocmVmPVwiL1wiIGNsYXNzTmFtZT1cIm5hdi1pdGVtXCI+SG9tZTwvTGluaz5cblxuICAgICAgICAgIHtzZXNzaW9uICYmIChcbiAgICAgICAgICAgIDw+XG4gICAgICAgICAgICAgIDxMaW5rIGhyZWY9XCIvZW50cmllcy9hZGRcIiBjbGFzc05hbWU9XCJuYXYtaXRlbVwiPkFkZCBFbnRyeTwvTGluaz5cbiAgICAgICAgICAgICAge2lzQWRtaW4gJiYgPExpbmsgaHJlZj1cIi9hZG1pblwiIGNsYXNzTmFtZT1cIm5hdi1pdGVtXCI+QWRtaW4gUGFuZWw8L0xpbms+fVxuICAgICAgICAgICAgICA8YnV0dG9uXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lPVwibmF2LWJ0blwiXG4gICAgICAgICAgICAgICAgb25DbGljaz17KCkgPT4gc2lnbk91dCh7IGNhbGxiYWNrVXJsOiBcIi9sb2dpblwiIH0pfVxuICAgICAgICAgICAgICA+XG4gICAgICAgICAgICAgICAgTG9nb3V0XG4gICAgICAgICAgICAgIDwvYnV0dG9uPlxuICAgICAgICAgICAgPC8+XG4gICAgICAgICAgKX1cblxuICAgICAgICAgIHshc2Vzc2lvbiAmJiAoXG4gICAgICAgICAgICA8TGluayBocmVmPVwiL2xvZ2luXCIgY2xhc3NOYW1lPVwibmF2LWl0ZW1cIj5Mb2dpbjwvTGluaz5cbiAgICAgICAgICApfVxuICAgICAgICA8L2Rpdj5cbiAgICAgIDwvZGl2PlxuICAgIDwvbmF2PlxuICApO1xufVxuIl0sIm5hbWVzIjpbIkxpbmsiLCJ1c2VTZXNzaW9uIiwic2lnbk91dCIsInVzZVN0YXRlIiwiTmF2YmFyIiwiZGF0YSIsInNlc3Npb24iLCJzdGF0dXMiLCJvcGVuIiwic2V0T3BlbiIsImlzQWRtaW4iLCJ1c2VyIiwicm9sZSIsIm5hdiIsImNsYXNzTmFtZSIsImRpdiIsImhyZWYiLCJidXR0b24iLCJvbkNsaWNrIiwiY2FsbGJhY2tVcmwiXSwiaWdub3JlTGlzdCI6W10sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(pages-dir-node)/./components/Navbar.js\n");

/***/ }),

/***/ "(pages-dir-node)/./pages/_app.js":
/*!***********************!*\
  !*** ./pages/_app.js ***!
  \***********************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   \"default\": () => (/* binding */ MyApp)\n/* harmony export */ });\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! react/jsx-dev-runtime */ \"react/jsx-dev-runtime\");\n/* harmony import */ var react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth/react */ \"next-auth/react\");\n/* harmony import */ var next_auth_react__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_auth_react__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! ../styles/globals.css */ \"(pages-dir-node)/./styles/globals.css\");\n/* harmony import */ var _styles_globals_css__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(_styles_globals_css__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var _components_Navbar__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ../components/Navbar */ \"(pages-dir-node)/./components/Navbar.js\");\n\n\n\n\nfunction MyApp({ Component, pageProps: { session, ...pageProps } }) {\n    return /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(next_auth_react__WEBPACK_IMPORTED_MODULE_1__.SessionProvider, {\n        session: session,\n        children: [\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(_components_Navbar__WEBPACK_IMPORTED_MODULE_3__[\"default\"], {}, void 0, false, {\n                fileName: \"/home/angryspanner/projects/Test-backup/pages/_app.js\",\n                lineNumber: 8,\n                columnNumber: 7\n            }, this),\n            /*#__PURE__*/ (0,react_jsx_dev_runtime__WEBPACK_IMPORTED_MODULE_0__.jsxDEV)(Component, {\n                ...pageProps\n            }, void 0, false, {\n                fileName: \"/home/angryspanner/projects/Test-backup/pages/_app.js\",\n                lineNumber: 9,\n                columnNumber: 7\n            }, this)\n        ]\n    }, void 0, true, {\n        fileName: \"/home/angryspanner/projects/Test-backup/pages/_app.js\",\n        lineNumber: 7,\n        columnNumber: 5\n    }, this);\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHBhZ2VzLWRpci1ub2RlKS8uL3BhZ2VzL19hcHAuanMiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBQWlEO0FBQ25CO0FBQ1c7QUFFMUIsU0FBU0UsTUFBTSxFQUFFQyxTQUFTLEVBQUVDLFdBQVcsRUFBRUMsT0FBTyxFQUFFLEdBQUdELFdBQVcsRUFBRTtJQUMvRSxxQkFDRSw4REFBQ0osNERBQWVBO1FBQUNLLFNBQVNBOzswQkFDeEIsOERBQUNKLDBEQUFNQTs7Ozs7MEJBQ1AsOERBQUNFO2dCQUFXLEdBQUdDLFNBQVM7Ozs7Ozs7Ozs7OztBQUc5QiIsInNvdXJjZXMiOlsiL2hvbWUvYW5ncnlzcGFubmVyL3Byb2plY3RzL1Rlc3QtYmFja3VwL3BhZ2VzL19hcHAuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU2Vzc2lvblByb3ZpZGVyIH0gZnJvbSBcIm5leHQtYXV0aC9yZWFjdFwiXG5pbXBvcnQgXCIuLi9zdHlsZXMvZ2xvYmFscy5jc3NcIlxuaW1wb3J0IE5hdmJhciBmcm9tIFwiLi4vY29tcG9uZW50cy9OYXZiYXJcIlxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBNeUFwcCh7IENvbXBvbmVudCwgcGFnZVByb3BzOiB7IHNlc3Npb24sIC4uLnBhZ2VQcm9wcyB9IH0pIHtcbiAgcmV0dXJuIChcbiAgICA8U2Vzc2lvblByb3ZpZGVyIHNlc3Npb249e3Nlc3Npb259PlxuICAgICAgPE5hdmJhciAvPlxuICAgICAgPENvbXBvbmVudCB7Li4ucGFnZVByb3BzfSAvPlxuICAgIDwvU2Vzc2lvblByb3ZpZGVyPlxuICApXG59XG4iXSwibmFtZXMiOlsiU2Vzc2lvblByb3ZpZGVyIiwiTmF2YmFyIiwiTXlBcHAiLCJDb21wb25lbnQiLCJwYWdlUHJvcHMiLCJzZXNzaW9uIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(pages-dir-node)/./pages/_app.js\n");

/***/ }),

/***/ "(pages-dir-node)/./styles/globals.css":
/*!****************************!*\
  !*** ./styles/globals.css ***!
  \****************************/
/***/ (() => {



/***/ }),

/***/ "next-auth/react":
/*!**********************************!*\
  !*** external "next-auth/react" ***!
  \**********************************/
/***/ ((module) => {

"use strict";
module.exports = require("next-auth/react");

/***/ }),

/***/ "next/dist/compiled/next-server/pages.runtime.dev.js":
/*!**********************************************************************!*\
  !*** external "next/dist/compiled/next-server/pages.runtime.dev.js" ***!
  \**********************************************************************/
/***/ ((module) => {

"use strict";
module.exports = require("next/dist/compiled/next-server/pages.runtime.dev.js");

/***/ }),

/***/ "react":
/*!************************!*\
  !*** external "react" ***!
  \************************/
/***/ ((module) => {

"use strict";
module.exports = require("react");

/***/ }),

/***/ "react/jsx-dev-runtime":
/*!****************************************!*\
  !*** external "react/jsx-dev-runtime" ***!
  \****************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-dev-runtime");

/***/ }),

/***/ "react/jsx-runtime":
/*!************************************!*\
  !*** external "react/jsx-runtime" ***!
  \************************************/
/***/ ((module) => {

"use strict";
module.exports = require("react/jsx-runtime");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/@swc"], () => (__webpack_exec__("(pages-dir-node)/./pages/_app.js")));
module.exports = __webpack_exports__;

})();