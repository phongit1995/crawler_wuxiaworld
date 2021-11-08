jQuery('input').iCheck({
	checkboxClass: 'icheckbox_square-blue',
	radioClass: 'iradio_square-blue',
	increaseArea: '20%'
});
$('input.check-all').on('ifChanged', function () {
	if (this.checked) {
		$('input.check-item').iCheck('check');
	} else {
		$('input.check-item').iCheck('uncheck');
	}
});
$('.btn-update-session').click(function () {
	$.post('/update-session', { session: $('#session').val() } , function (res) {
		alert(res.message);
		console.log(res);
		if(res.success){
			$('.current-account').text(res.data.account);
		}
	});
});
