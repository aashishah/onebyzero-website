var swiper = new Swiper(".mySwiper", {
  effect: "coverflow",
  grabCursor: true,
  centeredSlides: true,
  loop:true,
  slidesPerView: "auto",
  coverflowEffect: {
    rotate: 0,
    stretch: 0,
    depth: 150,
    modifier: 2.5,
    slideShadows: true,
  },
  autoplay:{

    delay: 3000,
    disableOnInteraction:false,
  }

});

const fadeElements = document.getElementsByClassName('scrollFade');

const scrollFade = () => {
  const viewportBottom = window.scrollY + window.innerHeight;

  for (let index = 0; index < fadeElements.length; index++) {
    const element = fadeElements[index];
    const rect = element.getBoundingClientRect();

    const elementFourth = rect.height/4;
    const fadeInPoint = window.innerHeight - elementFourth;

    if (rect.top <= fadeInPoint) {
      element.classList.add('scrollFade--animate');
      element.style.opacity = 1;
    }
  }
}

document.addEventListener('scroll', scrollFade);
window.addEventListener('resize', scrollFade);
document.addEventListener('DOMContentLoaded', () => {
  scrollFade();
});


document.getElementById('contactForm').addEventListener('submit', function(event) {
  event.preventDefault();
  let isValid = true;
  let email = document.getElementById('email');
  let phone = document.getElementById('phone');
  let emailError = document.getElementById('emailError');
  let phoneError = document.getElementById('phoneError');

  email.setCustomValidity('');
  phone.setCustomValidity('');

  if (!email.checkValidity()) {
      email.setCustomValidity('Please enter a valid email address.');
      email.reportValidity();
      emailError.style.display = 'block';
      email.classList.add('shake');
      isValid = false;
  } else {
      emailError.style.display = 'none';
      email.classList.remove('shake');
  }

  if (!phone.checkValidity()) {
      phoneError.style.display = 'block';
      phone.classList.add('shake');
      isValid = false;
  } else {
      phoneError.style.display = 'none';
      phone.classList.remove('shake');
  }

  if (isValid) {
      sendEmail();
  }
});

function sendEmail(){
    const form = document.getElementById('contactForm');
    const result = document.getElementById('response');

    form.addEventListener('submit', function(e) {
        const formData = new FormData(form);
        e.preventDefault();

        const object = Object.fromEntries(formData);
        const json = JSON.stringify(object);

        result.innerHTML = "Please wait..."

        fetch('https://api.web3forms.com/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: json
            })
            .then(async (response) => {
                let json = await response.json();
                if (response.status == 200) {
                    result.innerHTML = "We've got your message, we'll get back to you soon!";
                    result.style.color = '#adf0ae';
                } else {
                    console.log(response);
                    result.innerHTML = json.message;
                }
            })
            .catch(error => {
                console.log(error);
                result.innerHTML = "Something went wrong! Please try again in a few minutes or directly mail our website.";
                result.style.color = '#D34942';
            })
            .then(function() {
                form.reset();
                setTimeout(() => {
                    result.innerHTML = "";
                    result.style.color = "#E4DFFD";
                }, 5000);
            });
    });
}