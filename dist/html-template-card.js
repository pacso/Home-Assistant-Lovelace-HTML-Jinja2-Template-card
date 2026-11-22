// html-template-card: renders a Jinja2 template as the HTML content of a card.
(() => {
  const TAG = "html-template-card";
  const VERSION = "1.2.0";

  class HtmlTemplateCard extends HTMLElement {
    static getStubConfig() {
      return {
        ignore_line_breaks: true,
        content: "The sun is <b>{{ states('sun.sun') }}</b>.",
      };
    }

    setConfig(config) {
      if (!config || !config.content) {
        throw new Error("You need to define 'content' in your configuration.");
      }
      this._config = config;

      let root;
      if (config.picture_elements_mode) {
        root = document.createElement("div");
      } else {
        root = document.createElement("ha-card");
        root.style.padding = "16px";
      }
      if (this._root && this._root.parentNode === this) {
        this.replaceChild(root, this._root);
      } else {
        this.appendChild(root);
      }
      this._root = root;
      this._lastHtml = undefined;
      if (this._lastResult !== undefined && !config.do_not_parse) {
        this._render(this._lastResult); // keep showing content while re-subscribing
      }
      this._sync();
    }

    set hass(hass) {
      this._hass = hass;
      this._sync();
    }

    get hass() {
      return this._hass;
    }

    connectedCallback() {
      this._sync();
    }

    disconnectedCallback() {
      this._unsubscribe();
    }

    _template() {
      let content = String(this._config.content);
      if (!this._config.ignore_line_breaks) {
        content = content.replace(/\r?\n|\r/g, "</br>");
      }
      return content;
    }

    // Bring the subscription in line with the current config/hass/attachment.
    _sync() {
      if (!this._config || !this._root) return;

      if (this._config.do_not_parse) {
        this._unsubscribe();
        this._render(this._template());
        return;
      }
      if (!this.isConnected || !this._hass || !this._hass.connection) return;

      const conn = this._hass.connection;
      const template = this._template();
      const user = this._hass.user ? this._hass.user.name : undefined;
      const config = this._config;
      if (
        this._sub &&
        this._sub.conn === conn &&
        this._sub.template === template &&
        this._sub.user === user &&
        this._sub.config === config
      ) {
        return; // already subscribed to exactly this
      }
      this._unsubscribe();

      const sub = { conn, template, user, config, cancelled: false, unsub: null };
      this._sub = sub;
      conn
        .subscribeMessage(
          (msg) => {
            if (sub.cancelled || this._sub !== sub) return;
            if (msg && typeof msg.result !== "undefined") {
              this._lastResult = msg.result;
              this._render(msg.result);
            } else if (msg && msg.error && msg.level !== "WARNING") {
              this._renderError(msg.error);
            }
          },
          {
            type: "render_template",
            template,
            // Same variables the core Markdown card provides.
            variables: { config, user },
            // Without this the server logs template errors and sends nothing.
            report_errors: true,
          }
        )
        .then((unsub) => {
          if (sub.cancelled) {
            unsub(); // detached or superseded while the subscribe was in flight
          } else {
            sub.unsub = unsub;
          }
        })
        .catch((err) => {
          if (this._sub === sub) {
            this._sub = null; // allow a retry on the next hass update
            this._renderError((err && err.message) || err);
          }
        });
    }

    _unsubscribe() {
      const sub = this._sub;
      if (!sub) return;
      this._sub = null;
      sub.cancelled = true;
      if (sub.unsub) {
        try {
          const r = sub.unsub();
          if (r && typeof r.catch === "function") r.catch(() => {});
        } catch (e) {
          /* connection already gone */
        }
      }
    }

    _render(content) {
      const header = this._config.title
        ? `<div class="card-header" style="padding: 8px 0 16px 0;"><div class="name">${this._config.title}</div></div>`
        : "";
      const html = this._config.picture_elements_mode
        ? String(content)
        : `${header}<div>${content}</div>`;
      if (html === this._lastHtml) return;
      this._lastHtml = html;
      this._root.innerHTML = html;
    }

    _renderError(error) {
      const pre = document.createElement("pre");
      pre.style.cssText = "white-space:pre-wrap; color:var(--error-color, #db4437); margin:0;";
      pre.textContent = `Template error: ${typeof error === "string" ? error : JSON.stringify(error)}`;
      this._lastHtml = undefined;
      this._root.innerHTML = "";
      this._root.appendChild(pre);
    }

    getCardSize() {
      return 1;
    }
  }

  if (customElements.get(TAG)) {
    console.warn(`${TAG} ${VERSION}: element already defined - another copy of this card is loaded as a resource`);
  } else {
    customElements.define(TAG, HtmlTemplateCard);
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: TAG,
      name: "HTML Jinja2 Template card",
      description: "Renders a Jinja2 template as the HTML content of a card",
      preview: true,
      documentationURL: "https://github.com/pacso/Home-Assistant-Lovelace-HTML-Jinja2-Template-card",
    });
    console.info(`%c ${TAG} %c ${VERSION} `, "background:#333;color:#fff", "background:#f5b547;color:#000");
  }
})();
