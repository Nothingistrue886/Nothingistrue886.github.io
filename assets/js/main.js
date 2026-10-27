function toggleMenu() {
  var nav = document.getElementsByClassName("site-header-nav")[0];
  if (nav.style.display == "inline-flex") {
    nav.style.display = "none";
  } else {
    nav.style.display = "inline-flex";
  }
}

jQuery(function() {
  // 回到顶部
  function toTop () {
    var $toTop = $(".gotop");

    $(window).on("scroll", function () {
      if ($(window).scrollTop() >= $(window).height()) {
        $toTop.css("display", "block").fadeIn();
      } else {
        $toTop.fadeOut();
      }
    });

    $toTop.on("click", function (evt) {
      var $obj = $("body,html");
      $obj.animate({
        scrollTop: 0
      }, 240);

      evt.preventDefault();
    });
  }

  // 代码块一键复制按钮
  function initCodeCopy() {
    $(".markdown-body pre").each(function() {
      var $pre = $(this);
      if ($pre.parent().hasClass("code-block-wrapper")) return;

      $pre.wrap('<div class="code-block-wrapper"></div>');
      var $btn = $('<button class="code-copy-btn" type="button" aria-label="复制代码">复制</button>');
      $pre.parent().append($btn);

      $btn.on("click", function() {
        var code = $pre.find("code").length ? $pre.find("code").text() : $pre.text();
        var trimmed = code.replace(/\n$/, "");

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(trimmed).then(function() {
            showCopied($btn);
          });
        } else {
          var $temp = $("<textarea>");
          $("body").append($temp);
          $temp.val(trimmed).select();
          document.execCommand("copy");
          $temp.remove();
          showCopied($btn);
        }
      });
    });

    function showCopied($btn) {
      $btn.text("已复制").addClass("copied");
      setTimeout(function() {
        $btn.text("复制").removeClass("copied");
      }, 1500);
    }
  }

  toTop();
  initCodeCopy();

  // 注销历史残留的 Service Worker 并清理旧缓存
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (var i = 0; i < registrations.length; i++) {
        registrations[i].unregister();
      }
    });
  }
  if ("caches" in window) {
    caches.keys().then(function(names) {
      for (var i = 0; i < names.length; i++) {
        caches.delete(names[i]);
      }
    });
  }
});
