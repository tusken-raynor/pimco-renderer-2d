<template>
  <div id="attribute-selector-dropdown" data-component>
    <div class="dropdown-head">
      <div class="attribute-name">Web</div>
      <div class="close-button"></div>
    </div>
    <div class="list-wrapper">
      <div class="attribute-info">
        <div class="title">You can choose from several web options.</div>
        <div class="info">
          Typically, the web choice is based on the position that you play, but this is not a hard and fast rule. Often,
          the web selected is based on personal preference. Here are our web options, along with recommendations:
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">MODIFIED TRAP</div>
          <div class="description">Popular among pitchers and outfielders.</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">I-WEB</div>
          <div class="description">
            Popular among infielders, specifically shortstop and second.
          </div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">H-WEB</div>
          <div class="description">Popular for third base and outfielders.</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">CLOSED BASKET WEB</div>
          <div class="description">Popular among pitchers.</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">2 PIECE CLOSED WEB</div>
          <div class="description">Popular among pitchers.</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">FULL TRAP</div>
          <div class="description">Popular among outfielders.</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">DOUBLE H WEB</div>
          <div class="description">Popular for first base</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">DUAL HINGE</div>
          <div class="description">Popular among pitchers</div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">X WEB</div>
          <div class="description">
            Popular among infielders and youth players
          </div>
        </div>
      </div>
      <div class="full-option" data-component>
        <div class="swatch">
          <img
            src="/show-imgs/webs/closed.png"
            alt="Closed"
            srcset="/show-imgs/webs/closed@2x.png 2x, /show-imgs/webs/closed.png 1x"
          />
        </div>
        <div class="info">
          <div class="label">SPLIT TRAP</div>
          <div class="description">
            Popular among outfielders and for larger gloves
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: "AttributeSelectorDropdown",
};
</script>

<style lang="scss" scoped>
@import "../css/_vars.scss";
#attribute-selector-dropdown {
  position: absolute;
  top: -53px;
  right: 0;
  height: 53px;
  overflow-y: hidden;
  z-index: $popup-z;
  width: 0;
  overflow-x: hidden;
  transition: width 0.5s cubic-bezier(0.76, 0, 0.24, 1) 0.6s, height 0.6s cubic-bezier(0.76, 0, 0.24, 1);
}
#attribute-selector-dropdown.open {
  width: 100vw;
  height: calc(100vh);
  overflow-y: auto;
  transition: width 0.5s cubic-bezier(0.76, 0, 0.24, 1), height 0.7s cubic-bezier(0.76, 0, 0.24, 1) 0.2s;
}
#attribute-selector-dropdown .dropdown-head {
  height: 53px;
  background-color: $orange;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 18px;
  z-index: $popup-z;
  box-sizing: border-box;
  width: 100%;
}
#attribute-selector-dropdown .dropdown-head .attribute-name {
  font-size: 21px;
  line-height: 120%;
  letter-spacing: -0.025em;
  color: #fff;
  font-weight: 700;
  opacity: 0;
  transition: opacity 0.2s linear;
}
#attribute-selector-dropdown.open .dropdown-head .attribute-name {
  opacity: 1;
  transition: opacity 0.2s linear 0.5s;
}
#attribute-selector-dropdown .dropdown-head .close-button {
  height: 20px;
  width: 20px;
  position: relative;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s linear;
}
#attribute-selector-dropdown.open .dropdown-head .close-button {
  opacity: 1;
  transition: opacity 0.2s linear 0.2s;
}
#attribute-selector-dropdown .dropdown-head .close-button::before,
#attribute-selector-dropdown .dropdown-head .close-button::after {
  content: "";
  background-color: #fff;
  position: absolute;
  height: 141%;
  width: 2px;
  top: 50%;
  left: 50%;
  border-radius: 1px;
}
#attribute-selector-dropdown .dropdown-head .close-button::before {
  transform: translate(-50%, -50%) rotate(45deg);
}
#attribute-selector-dropdown .dropdown-head .close-button::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}
#attribute-selector-dropdown .list-wrapper {
  background-color: #fff;
}
#attribute-selector-dropdown .attribute-info {
  padding: 25px 36px 26px;
  font-size: 13px;
  font-weight: 300;
  line-height: 138.461%;
}
#attribute-selector-dropdown .attribute-info .title {
  font-weight: 700;
}
#attribute-selector-dropdown .attribute-info,
.full-option {
  opacity: 0;
  transition: opacity 0.2s linear;
}
#attribute-selector-dropdown.open .attribute-info,
.open .full-option {
  opacity: 1;
  transition: opacity 0.2s linear 0.5s;
}
</style>
